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
 * The Original Code is Speak Words.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *   Erik Vold <erikvvold@gmail.com>
 *   Greg Parris <greg.parris@gmail.com>
 *   Girish Sharma <scrapmachines@gmail.com>
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

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const global = this;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Remember if the keyword or domain was just completed
let justCompleted = false;

// Keep a sorted list of keywords to suggest
let sortedKeywords = [];

/**
 * Lookup a keyword to suggest for the provided query
 */
function getKeyword(query) {
  // Remember the original query to preserve its original casing
  let origQuery = query;

  // Split the query into before and after the last space
  let lastStart = query.lastIndexOf(" ") + 1;
  let before = query.slice(0, lastStart);

  // Suggest keywords for the last word of the query
  query = query.slice(lastStart).toLowerCase();

  // Don't suggest a keyword for a blank query
  if (query == "")
    return;

  // Get a local keywords reference and ignore domains for multi-word
  let keywords = sortedKeywords;
  if (before != "")
    keywords = keywords.filter(function(word) word.indexOf(".") == -1);

  // Find the first keyword that matches the beginning of the query
  let queryLen = query.length;
  let sortedLen = keywords.length;
  for (let i = 0; i < sortedLen; i++) {
    let keyword = keywords[i];
    if (keyword.slice(0, queryLen) == query)
      return origQuery + (before + keyword).slice(origQuery.length);
  }
}

/**
 * Automatically suggest a keyword when typing in the location bar
 */
function addKeywordSuggestions(window) {
  let urlBar = window.gURLBar;
  let deleting = false;

  // Look for deletes to handle them better on input
  listen(window, urlBar, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_BACK_SPACE:
      case event.DOM_VK_DELETE:
        deleting = true;
        break;
    }
  });

  // Detect tab presses to move the selection to the end ready for more
  listen(window, urlBar.parentNode, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_TAB:
        // Ignore tabs for switching tabs
        if (event.ctrlKey)
          return;

        // Ignore if the selection starts at front or nothing it selected
        let input = event.originalTarget;
        let {selectionEnd, selectionStart} = input;
        if (selectionStart == 0 || selectionEnd == selectionStart)
          return;

        // Move the selection to the end and stop the normal behavior
        input.setSelectionRange(selectionEnd, selectionEnd);
        event.preventDefault();
        event.stopPropagation();

        break;
    }
  });

  // Watch for urlbar value input changes to suggest keywords
  listen(window, urlBar, "input", function(event) {
    justCompleted = false;

    // Don't try suggesting a keyword when the user wants to delete
    if (deleting) {
      deleting = false;
      return;
    }

    // See if we can suggest a keyword if it isn't the current query
    let query = urlBar.textValue;
    let keyword = getKeyword(query);
    if (keyword == null || keyword == query)
      return;

    // Select the end of the suggestion to allow over-typing
    urlBar.value = keyword;
    urlBar.selectTextRange(query.length, keyword.length);
    justCompleted = true;

    // Make sure the search suggestions show up
    Utils.delay(function() urlBar.controller.startSearch(urlBar.value));
  });
}

/**
 * Automatically select the first location bar result on pressing enter
 */
function addEnterSelects(window) {
  // Remember what auto-select if enter was hit after starting a search
  let autoSelectOn;
  // Keep track of last shown result's search string
  let lastSearch;

  // Add some helper functions to various objects
  let gURLBar = window.gURLBar;
  let popup = gURLBar.popup;
  popup.__defineGetter__("noResults", function() {
    return this._matchCount == 0;
  });
  gURLBar.__defineGetter__("trimmedSearch", function() {
    return this.controller.searchString.trim();
  });
  gURLBar.__defineGetter__("willHandle", function() {
    // Potentially it's a url if there's no spaces
    let search = this.trimmedSearch;
    if (search.match(/ /) == null) {
      try {
        // Quit early if the input is already a URI
        return Services.io.newURI(gURLBar.value, null, null);
      }
      catch(ex) {}

      try {
        // Quit early if the input is domain-like (e.g., site.com/page)
        return Cc["@mozilla.org/network/effective-tld-service;1"].
          getService(Ci.nsIEffectiveTLDService).
          getBaseDomainFromHost(gURLBar.value);
      }
      catch(ex) {}
    }

    // Check if there's an search engine registered for the first keyword
    let keyword = search.split(/\s+/)[0];
    return Services.search.getEngineByAlias(keyword);
  });

  // Wait for results to get added to the popup
  let (orig = popup._appendCurrentResult) {
    popup._appendCurrentResult = function() {
      // Run the original first to get results added
      orig.apply(this, arguments);

      // Don't bother if something is already selected
      if (popup.selectedIndex >= 0)
        return;

      // Make sure there's results
      if (popup.noResults)
        return;

      // Unless we just completed a domain, don't auto-select if we have a url
      if (!(justCompleted && pref("autoSelectForDomain")) && gURLBar.willHandle)
        return;

      // We passed all the checks, so pretend the user has the first result
      // selected, so this causes the UI to show the selection style
      popup.selectedIndex = 0;

      // If the just-added result is what to auto-select, make it happen
      if (autoSelectOn == gURLBar.trimmedSearch) {
        // Clear out what to auto-select now that we've done it once
        autoSelectOn = null;
        gURLBar.controller.handleEnter(true);
      }

      // Remember this to notice if the search changes
      lastSearch = gURLBar.trimmedSearch;
    };

    unload(function() popup._appendCurrentResult = orig, window);
  }

  listen(window, gURLBar, "keydown", function(aEvent) {
    let KeyEvent = aEvent;
    switch (aEvent.keyCode) {
      // For horizontal movement, unselect the first item to allow editing
      case KeyEvent.DOM_VK_LEFT:
      case KeyEvent.DOM_VK_RIGHT:
      case KeyEvent.DOM_VK_HOME:
        popup.selectedIndex = -1;
        return;

      // For vertical movement, do nothing
      case KeyEvent.DOM_VK_UP:
      case KeyEvent.DOM_VK_DOWN:
        return;

      // We're interested in handling enter (return), do so below
      case KeyEvent.DOM_VK_RETURN:
        break;

      // For anything else, deselect the entry if the search changed
      default:
        if (lastSearch != gURLBar.trimmedSearch)
          popup.selectedIndex = -1;
        return;
    }

    // Ignore special key combinations
    if (aEvent.shiftKey || aEvent.ctrlKey || aEvent.metaKey)
      return;

    // Deselect if the selected result isn't for the current search
    if (!popup.noResults && lastSearch != gURLBar.trimmedSearch) {
      popup.selectedIndex = -1;

      // If it's not a url, we'll want to auto-select the first result
      if (!gURLBar.willHandle) {
        autoSelectOn = gURLBar.trimmedSearch;

        // Don't load what's typed in the location bar because it's a search
        aEvent.preventDefault();
      }

      return;
    }

    // Prevent the default enter (return) behavior
    aEvent.preventDefault();

    // Calling handleEnter will cause the selected popup item to be used
    gURLBar.mEnterEvent = aEvent;
    gURLBar.controller.handleEnter(true);
  });

  // Detect deletes of text to avoid accidentally deleting items
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_BACK_SPACE:
      case event.DOM_VK_DELETE:
        // The value will be the last search if auto-selected; otherwise the
        // value will be the manually selected autocomplete entry
        if (gURLBar.value != lastSearch)
          return;

        // Hack around to prevent deleting an entry
        let {mPopupOpen} = popup;
        popup.mPopupOpen = false;

        // Restore the original popup open value
        window.setTimeout(function() {
          popup.mPopupOpen = mPopupOpen;
        });
        break;
    }
  });
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data) AddonManager.getAddonByID(data.id, function(addon) {
  // Load various javascript includes for helper functions
  ["prefs", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  Cu.import("resource://services-sync/util.js");

  // XXX Force a QI until bug 609139 is fixed
  let {DBConnection} = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

  // Add suggestions to all windows
  watchWindows(addKeywordSuggestions);
  // Add enter-selects functionality to all windows
  watchWindows(addEnterSelects);

  // Break a string into individual words separated by the splitter
  function explode(text, splitter) {
    return (text || "").toLowerCase().split(splitter).filter(function(word) {
      // Only interested in not too-short words
      return word && word.length > 3;
    });
  }

  let tagSvc = Cc["@mozilla.org/browser/tagging-service;1"].
    getService(Ci.nsITaggingService);

  // Add the domain (without www) for the url
  function addDomain(url) {
    try {
      // Extract the domain and the top level domain
      let domain = url.match(/[\/@](?:www\.)?([^\/@:]+)[\/:]/)[1];
      let suffix = Services.eTLD.getPublicSuffixFromHost(domain);

      // Ignore special hostnames like localhost
      if (suffix == domain)
        suffix = "";
      let {length} = suffix;

      // Convert the full domain a.b.c.d into parts: a.b.c.d, b.c.d, c.d
      domain.split(".").forEach(function(val, index, all) {
        // Only add if it's more than the suffix
        let part = all.slice(index).join(".");
        if (part.length > length)
          allKeywords.push([part]);
      });
    }
    // Must have be some strange format url that we probably don't care about
    catch(ex) {}
  }

  // Don't add domains if the user doesn't want them
  if (!pref("addDomains"))
    addDomain = function() {};

  // Add keywords from the title and url
  function addTitleUrl(add, title, url) {
    add(explode(title, /[\s\-\/\u2010-\u202f"',.:;?!|()]+/));

    // Ignore some protocols
    if (url.search(/^(data|javascript|place)/) == 0)
      return;

    // Strip off the protocol and query/ref/params
    url = url.replace(/^[^:]*:\/*/, "");
    url = url.replace(/[?&#;].*$/, "");
    add(explode(url, /(?:[\/:.=+]|%[0-9A-F]{2})+/));
  }

  // Keep a nested array of array of keywords -- 2 arrays per entry
  let allKeywords = [];

  // Add search keywords to the list as potential keywords
  function addSearchKeywords() {
    Services.search.getVisibleEngines().forEach(function({alias}) {
      // Ignore missing keywords or cleared keywords
      if (alias != null && alias != "")
        allKeywords.push([alias]);
    });
  }

  // Only add search keywords if the user wants it
  if (pref("addSearchKeywords"))
    addSearchKeywords();

  // Add bookmark keywords to the list of potential keywords
  function addBookmarkKeywords() {
    spinQuery(DBConnection, {
      names: ["keyword"],
      query: "SELECT * FROM moz_keywords",
    }).forEach(function({keyword}) allKeywords.push([keyword]));
  }

  // Only add bookmark keywords if the user wants it
  if (pref("addBookmarkKeywords"))
    addBookmarkKeywords();

  // Use input history to discover keywords from typed letters
  spinQuery(DBConnection, {
    names: ["input", "url", "title"],
    query: "SELECT * " +
           "FROM moz_inputhistory " +
           "JOIN moz_places " +
           "ON id = place_id " +
           "WHERE input NOT NULL " +
           "ORDER BY use_count DESC",
  }).forEach(function({input, url, title}) {
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
    addDomain(url);
    addKeywords(tags);
    addTitleUrl(addKeywords, title, url);
  });

  // Use bookmarks to discover keywords from their titles or urls
  spinQuery(DBConnection, {
    names: ["url", "title"],
    query: "SELECT moz_places.url, moz_bookmarks.title " +
           "FROM moz_bookmarks " +
           "JOIN moz_places " +
           "ON moz_places.id = fk " +
           "WHERE moz_bookmarks.title NOT NULL " +
           "ORDER BY frecency DESC " +
           "LIMIT 100",
  }).forEach(function({url, title}) {
    addTitleUrl(function(parts) allKeywords.push(parts), title, url);
  });

  // Add in some typed subdomains/domains as potential keywords
  function addDomains(extraQuery) {
    spinQuery(DBConnection, {
      names: ["url"],
      query: "SELECT * FROM moz_places WHERE visit_count > 1 " + extraQuery,
    }).forEach(function({url}) addDomain(url));
  }
  addDomains("AND typed = 1 ORDER BY frecency DESC");
  addDomains("ORDER BY visit_count DESC LIMIT 100");
  addDomains("ORDER BY last_visit_date DESC LIMIT 100");

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
});

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

function install() {}
function uninstall() {}
