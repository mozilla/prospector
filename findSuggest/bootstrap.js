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
 * The Original Code is Find Suggest.
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

const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const PREF_BRANCH = "extensions.prospector.findSuggest.";
const PREFS = {
  minWordLength: 1,
  maxResults: 100,
  splitter: "[#0-/:-@[-`{-#191#8192-#8303]+", // !alphanum ASCII + punctuation
};

/**
 * Get the preference value of type specified in PREFS
 */
function getPref(key) {
  // Cache the prefbranch after first use
  if (getPref.branch == null)
    getPref.branch = Services.prefs.getBranch(PREF_BRANCH);

  // Figure out what type of pref to fetch
  switch (typeof PREFS[key]) {
    case "boolean":
      return getPref.branch.getBoolPref(key);
    case "number":
      return getPref.branch.getIntPref(key);
    case "string":
      return getPref.branch.getCharPref(key);
  }
  return null;
}

/**
 * Initialize default preferences specified in PREFS
 */
function setDefaultPrefs() {
  let branch = Services.prefs.getDefaultBranch(PREF_BRANCH);
  for (let [key, val] in Iterator(PREFS)) {
    switch (typeof val) {
      case "boolean":
        branch.setBoolPref(key, val);
        break;
      case "number":
        branch.setIntPref(key, val);
        break;
      case "string":
        branch.setCharPref(key, val);
        break;
    }
  }
}

/**
 * Get text from a content window
 */
function getText(content) {
  // Use the selection object to get strings separate by whitespace
  let selection = content.getSelection();
  let range;
  try {
    range = selection.getRangeAt(0);
  }
  catch(ex) {
    // Blank page throws an error, so do not return any words
    return "";
  }
  range.selectNode(content.document.body);
  let text = selection.toString();
  range.collapse(true);
  return text.trim();
}

/**
 * Get all the words in the content window sorted by frequency
 */
function getSortedWords(content) {
  if (content.sortedWords != null)
    return content.sortedWords;

  let text = getText(content);
  if (!text)
    return [];

  // Prefs can't hold unicode values, so encode them as #<decimal value>
  let splitter = RegExp(getPref("splitter").replace(/#\d+/g, function(str) {
    return String.fromCharCode(Number(str.slice(1)));
  }));

  // Count up how many times each word is used ignoring edge punctuation
  let words = text.toLowerCase().split(splitter);
  let wordFrequency = {};
  let minWordLength = getPref("minWordLength");
  words.forEach(function(word) {
    // Skip words that are too short
    if (word.length < minWordLength)
      return;

    // Prepend "w" to avoid special properties like __proto__
    let key = "w" + word;
    if (wordFrequency[key] == null)
      wordFrequency[key] = 1;
    else
      wordFrequency[key]++;
  });

  // Sort words by the most frequent first
  return content.sortedWords = Object.keys(wordFrequency).sort(function(a, b) {
    let freqDelta = wordFrequency[b] - wordFrequency[a];
    if (freqDelta != 0)
      return freqDelta;
    return a < b ? -1 : 1;
  }).map(function(key) key.slice(1));
}

/**
 * Augment the given window with find suggestions
 */
function addFindSuggestions(window) {
  let findBar = window.gFindBar;
  let findContainer = findBar.getElement("findbar-container");
  let findField = findBar._findField;

  // Update the suggestions when the find field changes
  function onFind() {
    let last = /(\S+)\s*$/.test(findField.value) ? RegExp.$1 : "";
    suggest(last, window.gBrowser.selectedBrowser.contentWindow);
  }
  listen(window, findField, "focus", onFind);
  listen(window, findField, "input", onFind);
  // Show suggestions when the find bar is opened
  listen(window, findBar, "DOMAttrModified", function(event) {
    if (findBar != event.target || !window.isElementVisible(findBar)
        || (event.attrName != "hidden" && event.attrName != "collapsed"))
      return;
    onFind();
  });

  // Clear out the suggestions when removing the add-on
  function clearSuggestions() {
    // Make a copy of the nodes as we modify it
    Array.slice(findContainer.childNodes).forEach(function(node) {
      if (node.getAttribute("class") == "findbar-suggestion")
        findContainer.removeChild(node);
    });
  }
  listen(window, window.gBrowser.tabContainer, "TabSelect", function() {
    clearSuggestions();
    if (!window.isElementVisible(findBar)) return;
    onFind();
  });
  unload(clearSuggestions, window);

  // Show suggestions for the provided word
  function suggest(query, content) {
    clearSuggestions();

    // Provide a callback to handle clicks that recursively suggests
    function suggestionClick(event) {
      let suggestion = event.target.value;
      if (findField.value === suggestion) {
        findBar.onFindAgainCommand(false);
      } else {
        let word = findField.value = suggestion;
        findBar._find();
        suggest(word, content);
      }
    }

    // Figure out which words to show for the given query
    let lowerQuery = query.toLowerCase();
    let queryLen = query.length;
    let matches = 0;
    let sortedWords = getSortedWords(content);
    let limit = getPref("maxResults");
    for each (let word in sortedWords) {
      // Only find prefix matches
      if (word.slice(0, queryLen) != lowerQuery)
        continue;

      // Show these suggestions in the findbar
      let suggestion = window.document.createElementNS(XUL_NS, "label");
      suggestion.setAttribute("class", "findbar-suggestion");
      suggestion.setAttribute("value", word);
      suggestion.style.margin = "2px";
      suggestion.style.cursor = "pointer";
      if (word == lowerQuery)
        suggestion.style.fontWeight = "bold";
      findContainer.appendChild(suggestion);

      // Fill in the word when clicking on it
      suggestion.addEventListener("click", suggestionClick, false);

      // Don't try suggesting too many words
      if (++matches == limit)
        break;
    }
  }

  // if the find bar is open, then make suggestions
  if (window.isElementVisible(findBar))
    onFind();
}

/**
 * Helper that adds event listeners and remembers to remove on unload
 */
function listen(window, node, event, func) {
  node.addEventListener(event, func, false);
  unload(function() node.removeEventListener(event, func, false), window);
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
function startup() {
  // Always set the default prefs as they disappear on restart
  setDefaultPrefs();

  // Add functionality to existing and new windows
  watchWindows(addFindSuggestions);
}

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
