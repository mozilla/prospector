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
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Keep a sorted list of keywords to suggest
let sortedKeywords = [];

/**
 * Lookup a keyword to suggest for the provided query
 */
function getKeyword(query) {
  let queryLen = query.length;
  let sortedLen = sortedKeywords.length;
  for (let i = 0; i < sortedLen; i++) {
    let keyword = sortedKeywords[i];
    if (keyword.slice(0, queryLen) == query)
      return keyword;
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

  // Watch for urlbar value input changes to suggest keywords
  listen(window, urlBar, "input", function(event) {
    // Don't try suggesting a keyword when the user wants to delete
    if (deleting) {
      deleting = false;
      return;
    }

    // See if we can suggest a keyword if it isn't the current query
    let query = urlBar.textValue.toLowerCase();
    let keyword = getKeyword(query);
    if (keyword == null || keyword == query)
      return;

    // Select the end of the suggestion to allow over-typing
    urlBar.value = keyword;
    urlBar.selectTextRange(query.length, keyword.length);

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
    return Cc["@mozilla.org/browser/search-service;1"].
      getService(Ci.nsIBrowserSearchService).getEngineByAlias(keyword);
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

      // Don't auto-select if we have a url
      if (gURLBar.willHandle)
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
    if (aEvent.shiftKey || aEvent.altKey || aEvent.ctrlKey || aEvent.metaKey)
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

    // Calling handleEnter will cause the selected popup item to be used
    gURLBar.controller.handleEnter(true);
  });
}

/**
 * Helper that adds event listeners and remembers to remove on unload
 */
function listen(window, node, event, func) {
  node.addEventListener(event, func, true);
  unload(function() node.removeEventListener(event, func, true), window);
}

/**
 * Apply a callback to each open and new browser windows.
 *
 * @usage watchWindows(callback): Apply a callback to each browser window.
 * @param [function] callback: 1-parameter function that gets a browser window.
 */
function watchWindows(callback) {
  // Wrap the callback in a function that ignores failures
  function watcher(window) {
    try {
      callback(window);
    }
    catch(ex) {}
  }

  // Wait for the window to finish loading before running the callback
  function runOnLoad(window) {
    // Listen for one load event before checking the window type
    window.addEventListener("load", function() {
      window.removeEventListener("load", arguments.callee, false);

      // Now that the window has loaded, only handle browser windows
      let doc = window.document.documentElement;
      if (doc.getAttribute("windowtype") == "navigator:browser")
        watcher(window);
    }, false);
  }

  // Add functionality to existing windows
  let browserWindows = Services.wm.getEnumerator("navigator:browser");
  while (browserWindows.hasMoreElements()) {
    // Only run the watcher immediately if the browser is completely loaded
    let browserWindow = browserWindows.getNext();
    if (browserWindow.document.readyState == "complete")
      watcher(browserWindow);
    // Wait for the window to load before continuing
    else
      runOnLoad(browserWindow);
  }

  // Watch for new browser windows opening then wait for it to load
  function windowWatcher(subject, topic) {
    if (topic == "domwindowopened")
      runOnLoad(subject);
  }
  Services.ww.registerNotification(windowWatcher);

  // Make sure to stop watching for windows if we're unloading
  unload(function() Services.ww.unregisterNotification(windowWatcher));
}

/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @usage unload(): Run all callbacks and release them.
 *
 * @usage unload(callback): Add a callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 *
 * @usage unload(callback, container) Add a scoped callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @param [node] container: Remove the callback when this container unloads.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 */
function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch(ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data) AddonManager.getAddonByID(data.id, function(addon) {
  Cu.import("resource://services-sync/util.js");

  // XXX Force a QI until bug 609139 is fixed
  Svc.History.QueryInterface(Ci.nsPIPlacesDatabase);

  // Add suggestions to all windows
  watchWindows(addKeywordSuggestions);
  // Add enter-selects functionality to all windows
  watchWindows(addEnterSelects);

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
