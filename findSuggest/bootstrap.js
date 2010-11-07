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
 *   Greg Parris <greg.parris@gmail.com>
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
 * Get all the words in the content window sorted by frequency
 */
function getSortedWords(content) {
  if (content.sortedWords != null)
    return content.sortedWords;

  // Use the selection object to get strings separate by whitespace
  let selection = content.getSelection();
  let range;
  try {
    range = selection.getRangeAt(0);
  }
  catch(ex) {
    // Blank page throws an error, so do not return any words
    return [];
  }
  range.selectNode(content.document.body);
  let text = selection.toString();
  range.collapse(true);

  // Prefs can't hold unicode values, so encode them as #<decimal value>
  let splitter = RegExp(getPref("splitter").replace(/#\d+/g, function(str) {
    return String.fromCharCode(Number(str.slice(1)));
  }));

  // Count up how many times each word is used ignoring edge punctuation
  let words = text.trim().toLowerCase().split(splitter);
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

  // Clear out the suggestions when removing the add-on
  function clearSuggestions() {
    // Make a copy of the nodes as we modify it
    Array.slice(findContainer.childNodes).forEach(function(node) {
      if (node.getAttribute("class") == "findbar-suggestion")
        findContainer.removeChild(node);
    });
  }
  listen(window, window.gBrowser.tabContainer, "TabSelect", clearSuggestions);
  addUnloaderForWindow(window, clearSuggestions);

  // Show suggestions for the provided word
  function suggest(query, content) {
    clearSuggestions();

    // Don't suggest for empty queries
    let queryLen = query.length;
    if (queryLen == 0)
      return;

    // Provide a callback to handle clicks that recursively suggests
    function suggestionClick(event) {
      let word = findField.value = event.target.value;
      findBar._find();
      suggest(word, content);
    }

    // Figure out which words to show for the given query
    let lowerQuery = query.toLowerCase();
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
      suggestion.setAttribute("style", "margin: 2px 2px 0;");
      suggestion.setAttribute("value", word);
      findContainer.appendChild(suggestion);

      // Fill in the word when clicking on it
      suggestion.addEventListener("click", suggestionClick, false);

      // Don't try suggesting too many words
      if (++matches == limit)
        break;
    }
  }
}

/**
 * Helper that adds event listeners and remembers to remove on unload
 */
function listen(window, node, event, func) {
  node.addEventListener(event, func, false);
  addUnloaderForWindow(window, function() {
    node.removeEventListener(event, func, false);
  });
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup() {
  // Always set the default prefs as they disappear on restart
  setDefaultPrefs();

  // Add functionality to existing windows
  let browserWindows = Services.wm.getEnumerator("navigator:browser");
  while (browserWindows.hasMoreElements())
    addFindSuggestions(browserWindows.getNext());

  // Watch for new browser windows opening
  function windowWatcher(subject, topic) {
    if (topic != "domwindowopened")
      return;

    subject.addEventListener("load", function() {
      subject.removeEventListener("load", arguments.callee, false);

      // Now that the window has loaded, only register on browser windows
      let doc = subject.document.documentElement;
      if (doc.getAttribute("windowtype") == "navigator:browser")
        addFindSuggestions(subject);
    }, false);
  }
  Services.ww.registerNotification(windowWatcher);
  unloaders.push(function() Services.ww.unregisterNotification(windowWatcher));
}

// Keep an array of functions to call when shutting down
let unloaders = [];
function addUnloader(unload) unloaders.push(unload) - 1;
function addUnloaderForWindow(window, unload) {
  let index1 = addUnloader(unload);
  let index2 = addUnloader(function() {
    window.removeEventListener("unload", winUnload, false);
  });

  // Remove unload funcs above if the window is closed.
  function winUnload() {
    unloaders[index1] = null;
    unloaders[index2] = null;
  }
  window.addEventListener("unload", winUnload, false);
}

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown() {
  unloaders.forEach(function(unload) unload && unload());
}

function install(){}
function uninstall(){}
