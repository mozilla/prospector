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
 *  Abhinav Sharma <me@abhinavsharma.me>
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

const reportError = console.log;
const J = JSON.stringify;
const {Cc, Ci, Cu, Cm} = require("chrome");
const utils = require("./utils");

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
Search.prototype.createIDFMap = function(tokens) {
  let me = this;
  let idfMap = {};

  /* find the number of documents aka. the number of places in moz_places, N */
  let N = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT COUNT(1) AS N FROM moz_places",
    "params": {},
    "names" : ["N"]
  })[0]["N"];
  
  /* now, find the idf for each word */
  tokens.forEach(function(word) {
    /* the idf map is global for each RecallMonkey instance, 
     * memoization to reduce db calls */
    if (word in me.idfMap) {
      return;
    }
    
    /* this covers all possible matches, some examples:
       "bar" matches "foo bar" using left
       "foo" matches "foo bar" using right
       "foo" matches "foo" using LOWER(title) = word
     */
    let left = '% ' + word + '%';
    let right = '%' + word + ' %';
    let query = "SELECT COUNT(1) as n from moz_places " +
      "WHERE LOWER(title) = :word OR title LIKE :left " +
      "OR title LIKE :right";
    let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
      "query" : query,
      "params" : {
        "left" : left,
        "right": right,
        "word": word,
      },
      "names": ["n"]
    });
    if (result.length == 0)
      return; // no matches, do not update the idf map

    /* the number of documents that match the token, n */
    let n = result[0]["n"];

    /* update the object idf map using the Okapi BM25 idf definition */
    me.idfMap[word] = Math.log((N - n + 0.5)/(n +0.5));
  });
}

/**
 * Gets the rowid which is used as the "parent" in the db
 * for all bookmarks that are actually tags.
 *
 * @return {number} rowid - the row ID that will later be used in the db call
 */
Search.prototype.setRowID = function() {
  let me = this;
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT rowid FROM moz_bookmarks_roots WHERE root_name = 'tags';",
    "params" : {},
    "names" : ["rowid"],
  });
  if (result.length == 0)
    throw "error: parent id for tags not found in moz_bookmarks_roots";

  me.rowid = result[0]["rowid"];
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
Search.prototype.queryTable = function(tokens, preferredHosts, excludedHosts, 
                                timeRange, limit, skip, prioritizeBookmarks) {
  let me = this;

  if (tokens.length == 0)
    return [];

  /* make sure the new tokens are in the idf map */
  me.createIDFMap(tokens);

  let wordSelections = [];
  let wordConditions = [];
  let rankSelection = [];
  let strictConditions = null;
  let names = ["id", "title", "tags","url", "frecency", "score", "rev_host", 
               "last_visit_date", "is_bookmark"];
  let orderList = [];
    
  me.setRowID();
  if (me.rowid < 0) {
    return [];
  }
  let wordParams = {
    "rowid" : me.rowid,
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
  if (timeRange != 0) {
    /* sql db stores time with more preciseness than js */
    let t = new Date().getTime() * 1000;
    strictConditions = t + " - last_visit_date < " + 
      "(:timeRange * 24 * 60 * 60 * 1000 * 1000) " + 
      "AND last_visit_date IS NOT NULL";
    wordParams['timeRange'] = timeRange;
  }
  
  /* if certain hosts are marked as preferred, prioritze them using a strict condition
   * and then changing the order.
   */
  if (preferredHosts && preferredHosts.length > 0) {
    let pref = [];
    for (let i = 0; i < preferredHosts.length; i++) {
      wordParams["host" + i] = preferredHosts[i];
      pref.push("(CASE rev_host WHEN :host" + i + " THEN 1 ELSE 0 END)")
    }
    let prefSelect = pref.join(' OR ') + " as is_pref";
    names.push("is_pref");
    ranked += "," + prefSelect;
    orderList.unshift("is_pref");
  }

  /* prioritize bookmarks if desired by changing the order */
  if (prioritizeBookmarks) {
    orderList.unshift("is_bookmark");
  }
  
  /* excluded certain hosts if desired using a strict condition */
  if (excludedHosts && excludedHosts.length > 0) {
    if (strictConditions) {
      strictConditions += " AND ";
    } else {
      strictConditions = "";
    }
    let i = 0;
    strictConditions += excludedHosts.map(function(host) {
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

  /* this is the outermost set of columns to be searched in, these come from both me.inner and
   * the extra conditions like is_pref.
   */
  let order = ' ORDER BY ' +
              orderList.map(function(cat) { return cat + " DESC"}).join(",") + 
              ' LIMIT ' + skip + ',' + limit;
  let searchDB = "(SELECT id, title, tags, url, frecency, rev_host,  is_bookmark, last_visit_date," + 
    selections + " FROM (" + me.inner + ") WHERE " + conditions + ")";
  let query = "SELECT id,title, tags, url, frecency, rev_host,is_bookmark,last_visit_date," + ranked + 
    " FROM " + searchDB + order;
  
  /* params must have at least the tokens */
  if (Object.keys(wordParams).length == 0) {
    return [];
  }

  return utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "names": names,
    "params": wordParams,
    "query" : query,
  }).map(function ({id, title, tags, url, frecency, rev_host, last_visit_date}) {
    return {
      "title" : title,
      "url" : url,
      "revHost": rev_host ,
      "isBookmarked": help.isBookmarked(url),
      "faviconData": help.getFaviconData(url),
      "tags" : tags ? tags.split(',') : [],
    };
  });
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
Search.prototype.search = function(query, params) {
  let me = this;

  /* tokenize and execute query */
  let tokens = me.tokenize(query);
  try{
  return me.queryTable(tokens, params.preferredHosts, 
                       params.excludedHosts, params.timeRange, 
                       params.limit, params.skip, params.prioritizeBookmarks);
                       } catch (ex) { reportError(J(ex)) }
}

/* export as a function in the search module */
exports.search = Search;
