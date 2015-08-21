/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Figure out what are the most frecently used sites
let topSites = [];
function computeTopSites() {
  // Use the saved top sites if it exists and is valid
  try {
    topSites = JSON.parse(prefs.get("topSites"));
    return;
  }
  catch(ex) {}

  const HEIGHT = 180;
  const SPACING = 10;
  const WIDTH = 270;

  let seenDomains = {};
  spinQuery(PlacesUtils.history.DBConnection, {
    names: ["url", "title"],
    query: "SELECT * " +
           "FROM moz_places " +
           "WHERE hidden = 0 " +
           "ORDER BY frecency DESC " +
           "LIMIT 100",
  }).forEach(function({url, title}) {
    // Stop at 9 sites for now
    let index = topSites.length;
    if (index == 9)
      return;

    // Only allow one site per domain for now until the user can customize
    try {
      let domain = Services.io.newURI(url, null, null).prePath;
      if (seenDomains[domain])
        return;
      seenDomains[domain] = true;
    }
    catch(ex) {
      return;
    }

    // Save this top site to display later
    topSites.push({
      browserHeight: 640,
      browserWidth: 640,
      height: HEIGHT,
      left: (WIDTH + SPACING) * (index % 3 - 1) - WIDTH / 2,
      offsetLeft: 0,
      offsetTop: 0,
      pageInfo: makePageInfo(title, url),
      top: (HEIGHT + SPACING) * (Math.floor(index / 3) - 1) - HEIGHT / 2,
      width: WIDTH,
      zoom: .5,
    });
  });
}

// Collect the bookmark keywords for later use
let bookmarkKeywords = {};
function collectBookmarkKeywords() {
  spinQuery(PlacesUtils.history.DBConnection, {
    names: ["keyword", "title", "url"],
    query: "SELECT " +
             "(SELECT keyword " +
              "FROM moz_keywords " +
              "WHERE id = keyword_id) keyword, " +
             "title, " +
             "(SELECT url " +
              "FROM moz_places " +
              "WHERE id = fk) url " +
           "FROM moz_bookmarks " +
           "WHERE keyword_id NOT NULL",
  }).forEach(function({keyword, title, url}) {
    // Ignore duplicate keywords and keep the first
    if (bookmarkKeywords[keyword] != null)
      return;

    // Figure out what kind of url transformation to do
    let getUrl;

    // Lowercase %s is an escaped replace
    if (url.indexOf("%s") != -1) {
      getUrl = function(params) {
        let escaped = encodeURIComponent(params).replace("%20", "+", "g");
        return url.replace("%s", escaped);
      };
    }
    // Uppercase %S is a plain replace
    else if (url.indexOf("%S") != -1)
      getUrl = function(params) url.replace("%S", params);
    // Just a plain bookmark with a keyword for the url
    else
      getUrl = function() url;

    // Package up various keyword information for later user
    let URI = Services.io.newURI(url, null, null);
    bookmarkKeywords[keyword] = {
      getUrl: getUrl,
      icon: PlacesUtils.favicons.getFaviconImageForPage(URI).spec,
      title: title
    }
  });
}

// Save an in-memory array of adaptive and domain data
let adaptiveData = [];
let domainData = [];

// Figure out what keywords might be useful to suggest to the user
let sortedKeywords = [];
function processAdaptive() {
  let {DBConnection} = PlacesUtils.history;

  // Break a string into individual words separated by the splitter
  function explode(text, splitter) {
    return (text || "").toLowerCase().split(splitter).filter(function(word) {
      // Only interested in not too-short words
      return word && word.length >= 3;
    });
  }

  let tagSvc = Cc["@mozilla.org/browser/tagging-service;1"].
    getService(Ci.nsITaggingService);

  // Keep a nested array of array of keywords -- 2 arrays per entry
  let allKeywords = [];

  // Use input history to discover keywords from typed letters
  spinQuery(DBConnection, {
    names: ["input", "url", "title"],
    query: "SELECT * " +
           "FROM moz_inputhistory " +
           "JOIN moz_places " +
           "ON id = place_id " +
           "WHERE input NOT NULL " +
           "ORDER BY ROUND(use_count) DESC, frecency DESC",
  }).forEach(function({input, url, title}) {
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

  // Add in some domains as potential keywords
  let domains = [];
  spinQuery(DBConnection, {
    names: ["rev_host"],
    query: "SELECT rev_host " +
           "FROM moz_places " +
           "WHERE rev_host NOT NULL AND rev_host != '.' " +
           "GROUP BY rev_host " +
           "ORDER BY MAX(typed) = 1 DESC, " +
                    "MAX(frecency) DESC, " +
                    "MAX(visit_count) DESC, " +
                    "MAX(last_visit_date) DESC",
  }).forEach(function({rev_host}) {
    // Remove the trailing dot and make it the right order
    rev_host = rev_host.slice(0, -1);
    let domain = rev_host.split("").reverse().join("");

    // Remove submdomains from the full domain
    try {
      domain = Services.eTLD.getBaseDomainFromHost(domain);
    }
    catch(ex) {}

    // Ignore duplicate domains
    if (domains.indexOf(domain) != -1)
      return;

    allKeywords.push(explode(domain, /\./));
    domains.push(domain);
  });

  // Generate a bunch of page infos for the collected domains
  domains.forEach(function(domain) {
    let url = "http://" + domain + "/";
    domainData.push([domain, makePageInfo("", url)]);
  });

  // Add bookmark keywords to the list of potential keywords
  spinQuery(DBConnection, {
    names: ["keyword"],
    query: "SELECT * FROM moz_keywords",
  }).forEach(function({keyword}) allKeywords.push([keyword]));

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
