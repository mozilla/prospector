/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const global = this;

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
 * Handle the add-on being activated on install/enable
 */
function startup(data) AddonManager.getAddonByID(data.id, function(addon) {
  // Load various javascript includes for helper functions
  ["prefs", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Always set the default prefs as they disappear on restart
  setDefaultPrefs();

  // Add functionality to existing and new windows
  watchWindows(addFindSuggestions);
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
