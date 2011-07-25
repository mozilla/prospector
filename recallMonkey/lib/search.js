/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Recall Monkey.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Abhinav Sharma <me@abhinavsharma.me> / abhinav on irc.mozilla.org
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const reportError = function(){}
const J = JSON.stringify;
const ss           = require("simple-storage");
const {Cc, Ci, Cu, Cm} = require("chrome");

const helpers = require("helpers");
let help = new helpers.help();

var Places = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", Places);

/**
 * Creates a search engine instance.
 *
 * @constructor
 * @this {Search}
 */
function Search() {
  let me = this;
  me.idfMap = {};
  me.pendingQueries = [];

  /* tokenize on spaces */
  me.re_tokenize = new RegExp(/[\s]/);
  me.inner = "SELECT * FROM " + 
    "(SELECT * FROM " + 
      "(SELECT p.id as id, 1 as is_bookmark, p.title as title,  " + 
      "p.url as url, p.frecency as frecency, p.rev_host as rev_host, " + 
      "p.last_visit_date as last_visit_date, GROUP_CONCAT(tag) as tags FROM " + 
        "(SELECT t.title as tag, b.fk as place_id FROM " + 
          // select tags
          "(SELECT * FROM moz_bookmarks WHERE parent = :rowid) t JOIN " +
           // join bookmarks with their respective tags
          "(SELECT * FROM moz_bookmarks WHERE type=1) b ON b.parent=t.id" +
        // join tagged bookmarks with moz_places for extra info like title, url, etc.  
        ") r JOIN moz_places p ON p.id=r.place_id GROUP BY p.id" + 
      // we have tagged bookmarks, must union with untagged bookmarks and all other places
      ") UNION SELECT * FROM " + 
      "(SELECT p.id as id, 1 as is_bookmark, b.title as title, " + 
      "p.url as url, p.frecency as frecency, p.rev_host as rev_host, " + 
      "p.last_visit_date as last_visit_date, '' as tags FROM " + 
        "(SELECT * FROM moz_bookmarks WHERE title is not null and fk is not null" +
        ") b JOIN moz_places p on p.id = b.fk WHERE " + 
        "p.url LIKE 'http%' AND p.title is not null AND p.last_visit_date is not null GROUP BY p.id" + 
      ") UNION " + 
      "SELECT id, 0 as is_bookmark, title, url, frecency, rev_host, last_visit_date, " + 
      "'' as tags FROM moz_places WHERE title is not null" + 
    // union with all other places
    ") GROUP BY id"; // remove duplicates from the union

}

/**
 * Tokenizes a string into a list of tokens
 *
 * @param  {string} str a string to be tokenized
 * @return {list} tokens a list of a string tokens
 */
Search.prototype.tokenize = function(str) {
  let me = this;
  if (!str) {
    return [];
  }
  return str.split(me.re_tokenize).map(function (s) {
    return s.toLowerCase();
  });
}

/**
 * Creates a mapping token -> idf where idf is the inverse document
 * frequency as defined by the Okapi BM25 scoring function.
 *
 * @param {list} tokens a list of words to create a mapping for
 * @return undefined
 */
Search.prototype.createIDFMap = function(tokens, data, searcher) {
  let me = this;
  let idfMap = {};
  reportError("creating idf map");

  let innerSelections = ["count"];
  let innerConditions = [];
  let params = {};
  let outerNames = ["count"];
  let outerSelections = ["count"];
  for (let i = 0; i < tokens.length; i++) {
    params["left"+i]  = '% ' + tokens[i]; + '%';
    params["right"+i] = '%'  + tokens[i]  + ' %';
    params["token"+i] = tokens[i];
    let condition = "(title LIKE :left" + i + 
                    " OR title LIKE :right" + i + 
                    " OR LOWER(title) = :token" + i + ")";
    innerSelections.push(condition + " as match" + i);
    innerConditions.push(condition);
    outerSelections.push("SUM(match" + i + ") as count" + i);
    outerNames.push("count" + i);
  }
  innerSelections = innerSelections.join(',');
  innerConditions = innerConditions.join(' OR ');
  outerSelections = outerSelections.join(',');
  let base = "(SELECT *, (SELECT COUNT(1) FROM moz_places) as count FROM moz_places)";
  let inner = "(SELECT " + innerSelections + " FROM " + base + " WHERE " +
              innerConditions + ")";
  let outer = "SELECT " + outerSelections + " FROM " + inner;

  /* prepare db connection and query */
  let conn = Places.PlacesUtils.history.DBConnection;
  let stmt = conn.createStatement(outer);
  for (let key in params) {
    stmt.params[key] = params[key];
  }
  
  /* execute in async and call the continuation search function */
  let pendingIDF = stmt.executeAsync({
    handleResult: function(aResultSet) {
      /* the result is in a single row, so guaranteed to be the first row */
      for (let row = aResultSet.getNextRow(); row; row=aResultSet.getNextRow()) {
        for (let i = 0; i < tokens.length; i++) {
          let n = row.getResultByName("count" + i);
          let N = row.getResultByName("count");
          me.idfMap[tokens[i]] = Math.log((N - n + 0.5)/(n +0.5));
        }
      }
      /* call the search continuation */
      searcher();
    }
  });
  me.pendingQueries.push({"time" : data.time, "query": pendingIDF});

}

/**
 * Queries the database for the given tokens. For what a rev_host is, look in
 * the moz_places sql database.
 * 
 * @param {list}    tokens : a list of word tokens to be searched for
 * @param {list}    preferredHosts : a list of revHosts that are preferred
 * @param {list}    excludedHosts : a list of revHosts that are excluded
 * @param {number}  timeRange : 
 * @param {number}  limit : 
 * @param {number}  skip : 
 * @param {boolean} prioritizeBookmarks : 
 *
 * @return {list}
 */
Search.prototype.queryTable = function(tokens, params, data, worker) {
  let me = this;

  if (tokens.length == 0)
    return [];

  /* make sure the new tokens are in the idf map */
  let wordSelections = [];
  let wordConditions = [];
  let rankSelection = [];
  let strictConditions = null;
  let names = ["id", "title", "tags","url", "frecency", "score", "rev_host", 
               "last_visit_date", "is_bookmark"];
  let orderList = [];
  
  if (ss.storage.rowid <= 0) {
    return [];
  }
  let wordParams = {
    "rowid" : ss.storage.rowid,
  };

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];

    /* add necessary params from this token to be used in the query */
    wordParams["left" + i]     = '% ' + token + '%';
    wordParams["right" + i]    = '%' + token + ' %';
    wordParams["submatch" + i] = '%'+ token + '%';
    wordParams["word" + i]     = token;
    wordParams["idf" + i]      = me.idfMap[token];
    
    /* word_i is 1 if any of the matches hold, 0 otherwise */
    wordSelections.push("(title LIKE :left" + i +") OR " + 
                        "(title LIKE :right" + i + ") OR " + 
                        "(CASE LOWER(title) " + 
                          "WHEN :word" + i + " THEN 1 ELSE 0 END) " + 
                        "as word_" + i);
    /* url_i is 1 if the url contains the string, 1 otherwise, search engines
     * commonly use this to search into urls and tokenization is used less. */
    wordSelections.push("(url LIKE :submatch" + i  + ") as url_" + i);
    /* tags are matched like the title, but the token demiliter is a comma (,)*/
    wordSelections.push("(tags LIKE :submatch" + i + ") as tag_" + i);
 
    /* a weaker set of conditions required to filter */
    /* TODO: this might be unnecessary */
    wordConditions.push("title LIKE :submatch" + i);
    wordConditions.push("url LIKE :submatch" + i);
    wordConditions.push("tags LIKE :submatch" + i);
   
    /* these help towards computing the score. remember that score is \sum idf *  tf */
    rankSelection.push("(word_" + i + " * :idf" + i + ")");
    rankSelection.push("(url_"  + i + " * :idf" + i + ")");
    rankSelection.push("(tag_"  + i + " * :idf" + i + ")");
  }

  let selections = wordSelections.join(' , ');
  let conditions = wordConditions.join(' OR ');
  let ranked = rankSelection.join(' + ') + " as score";
  orderList = ["score", "frecency"]
  
  /* default time range is 0, which means search everything, adjust if custom
   * by adding a strict condition.
   */
  if (params.timeRange != 0) {
    /* sql db stores time with more preciseness than js */
    let t = new Date().getTime() * 1000;
    strictConditions = t + " - last_visit_date < " + 
      "(:timeRange * 24 * 60 * 60 * 1000 * 1000) " + 
      "AND last_visit_date IS NOT NULL";
    wordParams['timeRange'] = params.timeRange;
  }
  
  /* if certain hosts are marked as preferred, prioritze them using a strict condition
   * and then changing the order.
   */
  if (params.preferredHosts && params.preferredHosts.length > 0) {
    let pref = [];
    for (let i = 0; i < params.preferredHosts.length; i++) {
      wordParams["host" + i] = params.preferredHosts[i];
      pref.push("(CASE rev_host WHEN :host" + i + " THEN 1 ELSE 0 END)")
    }
    let prefSelect = pref.join(' OR ') + " as is_pref";
    names.push("is_pref");
    ranked += "," + prefSelect;
    orderList.unshift("is_pref");
  }

  /* prioritize bookmarks if desired by changing the order */
  if (params.prioritizeBookmarks) {
    orderList.unshift("is_bookmark");
  }
  
  /* excluded certain hosts if desired using a strict condition */
  if (params.excludedHosts && params.excludedHosts.length > 0) {
    if (strictConditions) {
      strictConditions += " AND ";
    } else {
      strictConditions = "";
    }
    let i = 0;
    strictConditions += params.excludedHosts.map(function(host) {
      wordParams["exclHost"  + i] = host;
      let str = "rev_host != :exclHost" + i;
      i++;
      return str;
    }).join(' AND ');
  }
  
  /* apply the strict conditions to the query if any were populated */
  if (strictConditions) {
    conditions = "(" + conditions + ") AND " + strictConditions;
  }

  /* this is the outermost set of columns to be searched in, 
   * these come from both me.inner and the extra conditions like is_pref.
   */
  let order = ' ORDER BY ' +
              orderList.map(function(cat) { return cat + " DESC"}).join(",") + 
              ' LIMIT ' + params.skip + ',' + params.limit;
  let searchDB = "(SELECT id, title, tags, url, frecency, rev_host,  is_bookmark, last_visit_date," + 
    selections + " FROM (" + me.inner + ") WHERE " + conditions + ")";
  let query = "SELECT id,title, tags, url, frecency, rev_host,is_bookmark,last_visit_date," + ranked + 
    " FROM " + searchDB + order;
  
  /* params must have at least the tokens */
  if (Object.keys(wordParams).length == 0) {
    return [];
  }
  

  let conn = Places.PlacesUtils.history.DBConnection;
  let stmt = conn.createStatement(query);
  for (let key in wordParams) {
    stmt.params[key] = wordParams[key];
  }
  let results = [];

  let pendingTF = stmt.executeAsync({
    handleResult: function(aResultSet) {
      for (let row = aResultSet.getNextRow(); row; row=aResultSet.getNextRow()) {
        let tags = row.getResultByName("tags");
        results.push({
          "title"       : row.getResultByName("title"),
          "url"         : row.getResultByName("url"),
          "revHost"     : row.getResultByName("rev_host"),
          "isBookmarked": row.getResultByName("is_bookmark"),
          "faviconData" : help.getFaviconData(row.getResultByName("url")),
          "tags" : tags ? tags.split(',') : [],
        })
      }
      reportError(results.length);   
    },

    handleCompletion: function(aReason) {
      worker.postMessage({
        "action": "display",
        "results" : results,
        "append" : data.append,
        "time"   : data.time
      });
    },

  });
  me.pendingQueries.push({"time" : data.time, "query": pendingTF});
}

/**
 * Given a query string and parameters, executes search and returns results.
 *
 * @param {string} query The string for the query to be searched
 * @param {Object} params Parameters for the query
 *  params.preferredHosts      {list} Hosts that are to be prioritized
 *  params.excludedHosts       {list} Hosts that are to be excluded from search results
 *  params.timeRange           {number} Number of days to be searched through
 *  params.limit               {number} Number of results to be returned
 *  params.skip                {number} Number of results to be skipped
 *  params.prioritizeBookmarks {boolean} true to float all bookmarked results to top.
 */
Search.prototype.search = function(query, params, data, worker) {
  let me = this;

  /* on a new search, cancel all pending searches to save resources */
  me.pendingQueries = me.pendingQueries.map(function({time, query}) {
    if (time < data.time && query) {
      query.cancel();
    }
    return {"time" : time, "query" : query}
  }).filter(function({time, query}) {
    return (time >= data.time);
  });

  /* tokenize and execute query */
  let tokens = me.tokenize(query);
  if (tokens.length == 0) {
    worker.postMessage({
      "action": "display",
      "results" : [],
      "append" : data.append,
      "time"   : data.time,
    });
    return;
  }

  me.createIDFMap(tokens, data, function() {
    /* execute tf search as a continuation after the idf map is ready */
    me.queryTable(tokens, params, data, worker);
  });
}
/* export as a function in the search module */
exports.search = Search;
