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
let ut = new helpers.help();


var Places = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", Places);

function Search() {
  reportError("init search");
  let me = this;
  me.idfMap = {};
  me.re_tokenize = new RegExp(/[\s]/);
  me.inner = "SELECT * FROM (SELECT * FROM (SELECT p.id as id, 1 as is_bookmark, p.title as title,  p.url as url, p.frecency as frecency, p.rev_host as rev_host, p.last_visit_date as last_visit_date, GROUP_CONCAT(tag) as tags FROM (SELECT t.title as tag, b.fk as place_id FROM (SELECT * FROM moz_bookmarks WHERE parent = :rowid) t JOIN (SELECT * FROM moz_bookmarks WHERE type=1) b ON b.parent=t.id) r JOIN moz_places p ON p.id=r.place_id GROUP BY p.id) UNION SELECT * FROM (SELECT p.id as id, 1 as is_bookmark, b.title as title, p.url as url, p.frecency as frecency, p.rev_host as rev_host, p.last_visit_date as last_visit_date, '' as tags FROM (SELECT * FROM moz_bookmarks WHERE title is not null and fk is not null) b JOIN moz_places p on p.id = b.fk WHERE p.url LIKE 'http%' AND p.title is not null AND p.last_visit_date is not null GROUP BY p.id) UNION SELECT id, 0 as is_bookmark, title, url, frecency, rev_host, last_visit_date, '' as tags FROM moz_places WHERE title is not null) GROUP BY id";

}

Search.prototype.tokenize = function(str) {
  let me = this;
  if (!str) {
    return [];
  }
  return str.split(me.re_tokenize).map(function (s) {
    return s.toLowerCase();
  });
}

Search.prototype.createIDFMap = function(words) {
  let me = this;
  let idfMap = {};

  /* find the number of documents, N */
  reportError("Finding N");
  reportError(Places.PlacesUtils.history.DBConnection);
  let N = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT COUNT(1) AS N FROM moz_places",
    "params": {},
    "names" : ["N"]
  })[0]["N"];
  reportError("N2");
  words.forEach(function(word) {
    if (word in me.idfMap) {
      return;
    }
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
    let n = result[0]["n"];
    me.idfMap[word] = Math.log((N - n + 0.5)/(n +0.5));
  });
}


Search.prototype.getRowID = function() {
  let me = this;
  return utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT rowid FROM moz_bookmarks_roots WHERE root_name = 'tags';",
    "params" : {},
    "names" : ["rowid"],
  })[0]["rowid"];
}


Search.prototype.createBIDFMap = function(words) {
  let me = this;
}

Search.prototype.queryTable = function(words, preferredHosts, excludedHosts, timeRange, limit, skip, prioritizeBookmarks) {
  let me = this;
  me.createIDFMap(words);
  let wordSelections = [];
  let wordConditions = [];
  let rankSelection = [];
  let names = ["id", "title", "tags","url", "frecency", "score", "rev_host", "last_visit_date", "is_bookmark"];
  me.rowid = me.getRowID();
  let wordParams = {
    "rowid" : me.rowid,
  };

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    wordParams["left" + i] = '% ' + word + '%';
    wordParams["right" + i] = '%' + word + ' %';
    wordParams["exact" + i] = '%'+ word + '%';
    wordParams["word" + i] = word;
    wordParams["idf" + i] = me.idfMap[word];
    wordSelections.push("(title LIKE :left" + i +") OR (title LIKE :right" + i + ") OR " + 
      "(CASE LOWER(title) WHEN :word" + i + " THEN 1 ELSE 0 END) as word_" + i);
    wordSelections.push("(url LIKE :exact" + i  + ") as url_" + i);
    wordSelections.push("(tags LIKE :exact" + i  + ") as tag_" + i);
    wordConditions.push("title LIKE :exact" + i);
    wordConditions.push("url LIKE :exact" + i);
    rankSelection.push("(word_" + i + " * :idf" + i + ")");
    rankSelection.push("(url_"  + i + " * :idf" + i + ")");
    rankSelection.push("(tag_"  + i + " * :idf" + i + ")");
  }
  
  let strictConditions =  null;
  if (timeRange != 0) {
    let t = new Date().getTime() * 1000;
    strictConditions = t + " - last_visit_date < (:timeRange * 24 * 60 * 60 * 1000 * 1000) AND last_visit_date IS NOT NULL"
    wordParams['timeRange'] = timeRange;
  }


  let selections = wordSelections.join(' , ');
  let conditions = wordConditions.join(' OR ');
  let ranked = rankSelection.join(' + ') + " as score";
  let order = ' ORDER BY score DESC, frecency DESC LIMIT ' + skip + "," + limit;
  
  if (preferredHosts && preferredHosts.length > 0) {
    let pref = [];
    var prefMap = {};
    for (let i = 0; i < preferredHosts.length; i++) {
      wordParams["host" + i] = preferredHosts[i];
      pref.push("(CASE rev_host WHEN :host" + i + " THEN 1 ELSE 0 END)")
    }
    var prefSelect = pref.join(' OR ') + " as is_pref";
    names.push("is_pref");
    ranked += "," + prefSelect;

    order = ' ORDER BY is_pref DESC, score DESC, frecency DESC LIMIT ' + skip + "," + limit;
  }


  if (prioritizeBookmarks) {
    if (preferredHosts && preferredHosts.length > 0) {
      order = ' ORDER BY is_bookmark DESC, is_pref DESC, score DESC, frecency DESC LIMIT ' + skip + ',' + limit;
    } else {
      order = ' ORDER BY is_bookmark DESC, score DESC, frecency DESC LIMIT ' + skip + ',' + limit;
    }
  }
  console.log(order);
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
  
  if (strictConditions) {
    conditions = "(" + conditions + ") AND " + strictConditions;
  }

  let inner = "(SELECT id, title, tags, url, frecency, rev_host,  is_bookmark, last_visit_date," + selections + 
    " FROM (" + me.inner + ") WHERE " + conditions + ")";
  let query = "SELECT id,title, tags, url, frecency, rev_host,is_bookmark,last_visit_date," + ranked + " FROM " + 
    inner + order;
  reportError(query);
  reportError(J(wordParams));
  
  if (Object.keys(wordParams).length == 0) {
    return [];
  }
  try{
  return utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "names": names,
    "params": wordParams,
    "query" : query,
  }).map(function ({id, title, tags, url, frecency, rev_host, last_visit_date}) {
    return {
      "title" : title,
      "url" : url,
      "revHost": rev_host ,
      "isBookmarked": ut.isBookmarked(url),
      "faviconData": ut.getFaviconData(url),
      "tags" : tags ? tags.split(',') : [],
    };
  });
  } catch (ex) { reportError(J(ex)); }
}

Search.prototype.search = function(query, params) {
  let me = this;
  reportError("tokenizing" + query);
  let words = me.tokenize(query);
  reportError("querying " + J(words));
  let result = me.queryTable(words, params.preferredHosts, params.excludedHosts, params.timeRange, params.limit, params.skip, params.prioritizeBookmarks);
  return result;
}

exports.search = Search;
