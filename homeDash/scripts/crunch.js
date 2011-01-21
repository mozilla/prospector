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
 * The Original Code is Home Dash Data Crunching.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
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

"use strict";

// Figure out what are the most frecently used sites
let topSites = [];
function computeTopSites() {
  let db = Svc.History.DBConnection;
  let stm = Utils.createStatement(db,
    "SELECT * " +
    "FROM moz_places " +
    "ORDER BY frecency DESC " +
    "LIMIT 24");
  Utils.queryAsync(stm, ["url", "title"]).forEach(function({url, title}) {
    topSites.push(makePageInfo(title, url));
  });
}

// Save an in-memory array of adaptive data
let adaptiveData = [];

// Figure out what keywords might be useful to suggest to the user
let sortedKeywords = [];
function processAdaptive() {
  // Use input history to discover keywords from typed letters
  let query = "SELECT * " +
              "FROM moz_inputhistory " +
              "JOIN moz_places " +
              "ON id = place_id " +
              "WHERE input NOT NULL " +
              "ORDER BY frecency DESC";
  let cols = ["input", "url", "title"];
  let stmt = Utils.createStatement(Svc.History.DBConnection, query);

  // Break a string into individual words separated by the splitter
  function explode(text, splitter) {
    return (text || "").toLowerCase().split(splitter).filter(function(word) {
      // Only interested in not too-short words
      return word && word.length > 3;
    });
  }

  let tagSvc = Cc["@mozilla.org/browser/tagging-service;1"].
    getService(Ci.nsITaggingService);

  // Keep a nested array of array of keywords -- 2 arrays per entry
  let allKeywords = [];
  Utils.queryAsync(stmt, cols).forEach(function({input, url, title}) {
    // Track all the adaptive data in memory with page info
    adaptiveData.push([input, makePageInfo(title, url)]);

    // Add keywords for word parts that start with the input word
    let word = input.trim().toLowerCase().split(/\s+/)[0];
    word = word.replace("www.", "");
    let wordLen = word.length;
    if (wordLen == 0)
      return;

    // Need a nsIURI for various interfaces to get tags
    let URI = Services.io.newURI(url, null, null);
    let tags = tagSvc.getTagsForURI(URI);

    // Only use the parts that match the beginning of the word
    function addKeywords(parts) {
      allKeywords.push(parts.filter(function(part) {
        return part.slice(0, wordLen) == word;
      }));
    }

    // Add keywords from tags, url (ignoring protocol), title
    addKeywords(tags);
    addKeywords(explode(url, /[\/:.?&#=%+]+/).slice(1));
    addKeywords(explode(title, /[\s\-\/\u2010-\u202f\"',.:;?!|()]/));
  });

  // Add in some typed subdomains/domains as potential keywords
  function addDomains(extraQuery) {
    let query = "SELECT * FROM moz_places WHERE visit_count > 1 " + extraQuery;
    let cols = ["url"];
    let stmt = Utils.createStatement(Svc.History.DBConnection, query);
    Utils.queryAsync(stmt, cols).forEach(function({url}) {
      try {
        allKeywords.push(explode(url.match(/[\/@]([^\/@:]+)[\/:]/)[1], /\./));
      }
      // Must have be some strange format url that we probably don't care about
      catch(ex) {}
    });
  }
  addDomains("AND typed = 1 ORDER BY frecency DESC");
  addDomains("ORDER BY visit_count DESC LIMIT 100");
  addDomains("ORDER BY last_visit_date DESC LIMIT 100");

  // Add bookmark keywords to the list of potential keywords
  let query = "SELECT * FROM moz_keywords";
  let stmt = Utils.createStatement(Svc.History.DBConnection, query);
  let cols = ["keyword"];
  Utils.queryAsync(stmt, cols).forEach(function({keyword}) {
    allKeywords.push([keyword]);
  });

  // Do a breadth first traversal of the keywords
  do {
    // Remove any empty results and stop if there's no more
    allKeywords = allKeywords.filter(function(keywords) keywords.length > 0);
    if (allKeywords.length == 0)
      break;

    // Get the first keyword of each result and add if it doesn't exist
    allKeywords.map(function(keywords) {
      let keyword = keywords.shift();
      if (sortedKeywords.indexOf(keyword) == -1) {
        sortedKeywords.push(keyword);
      }
    });
  } while (true);
}
