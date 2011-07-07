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
 * The Original Code is Search Tabs.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *   Margaret Leibovic <margaret.leibovic@gmail.com>
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
const global = this;

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Remember various offsets enough to hide tabs + shadow or show them
const OFFSETS = {
  hidden: -100,
  partial: -64,
  shown: 0,
};

// Add search tabs that allow searching with installed search engines
function addSearchTabs(window) {
  let {async, change, createNode, getDominantColor, listen, unload} = makeWindowHelpers(window);
  let {document, gBrowser} = window;

  // Make sure the search bar is hidden as desired
  let hideSearch = pref("hideSearchbar");
  change(document.getElementById("search-container"), "hidden", hideSearch);

  // Create a box for tabs that sit near the bottom of the screen
  let tabs = createNode("hbox");
  tabs.setAttribute("bottom", 0);
  tabs.setAttribute("id", "searchTabs");

  // Keep track of the prefix and suffix url parts for each engine
  tabs.engineParts = [];

  // Figure out the query terms if it's a search
  tabs.extractQuery = function(url) {
    let {cache} = tabs.extractQuery;
    if (cache != null && cache.url == url)
      return cache.query;

    let query;
    tabs.engineParts.some(function({prefix, suffix}) {
      if (url.indexOf(prefix) != 0)
        return false;

      let suffixPos = url.lastIndexOf(suffix);
      if (url.slice(suffixPos) != suffix)
        return false;

      let component = url.slice(prefix.length, suffixPos).replace(/\+/g, " ");
      query = decodeURIComponent(component);
      return true;
    });

    // Keep a cache of the last processed url
    tabs.extractQuery.cache = {
      query: query,
      url: url,
    };

    return query;
  };

  // Move the box to the current tab
  tabs.move = function() {
    gBrowser.selectedBrowser.parentNode.appendChild(tabs);
  };
  tabs.move();

  // Initially everything is shown
  tabs.offset = OFFSETS.shown;

  // Shift all the tabs to a desired offset
  tabs.shiftAll = function(offset) {
    tabs.offset = offset;
    Array.forEach(tabs.childNodes, function(tab) tab.shift(offset));
  };

  // Clean up when necessary
  unload(function() tabs.parentNode.removeChild(tabs));

  // Make sure the tabs are on the current browser stack
  listen(gBrowser.tabContainer, "TabSelect", function() tabs.move());

  // Create search tabs based on the installed search engines
  Services.search.getVisibleEngines().forEach(function(engine) {
    let tab = createNode("box");
    tab.setAttribute("class", "searchTab");
    tabs.appendChild(tab);

    // Shift and change the transparency based on how much to offset
    tab.offset = function(offset) {
      tab.style.marginBottom = offset + "px";
      tab.style.marginTop = -offset + "px";
      tab.style.opacity = (offset - OFFSETS.hidden) / -OFFSETS.hidden;
    };

    // Animate a shift to some offset
    tab.shift = function(target) {
      // Cancel out any previous animations
      if (tab.shifter != null)
        tab.shifter();

      // Remember where we started
      let from = parseInt(tab.style.marginBottom) || 0;

      // Keep track of the animation progress
      let startTime = Date.now();

      // Do all steps on a timer so that show-hide-show won't flicker
      (function shiftStep() tab.shifter = async(function() {
        // Start a little slow then speed up
        let step = Math.pow(Math.min(1, (Date.now() - startTime) / 150), 1.5);

        // Figure out how much to show based on where we started
        tab.offset(from + (target - from) * step);

        // Prepare the next step of the animation
        if (step < 1)
          shiftStep();
        // Otherwise we're done!
        else
          tab.shifter = null;
      }))();
    }

    // Do a search with whatever value we have
    tab.addEventListener("click", function() {
      // Don't bother if tabs are already hidden
      if (tabs.offset == OFFSETS.hidden)
        return;

      // Shift everything away now that we're loading
      tabs.shiftAll(OFFSETS.hidden);

      // Open the search url in a tab
      let url = engine.getSubmission(checker.value).uri.spec;
      if (!window.isTabEmpty(gBrowser.selectedTab)) {
        window.openUILinkIn(url, "tab");
        return;
      }

      // Just show the search in the current empty tab
      let {selectedBrowser} = gBrowser;
      selectedBrowser.loadURI(url);
      selectedBrowser.focus();
    }, false);

    // Reset the offset to where others are
    tab.addEventListener("mouseout", function() {
      tab.shift(tabs.offset);
    }, false);

    // Show the tab sticking out if it's not supposed to be hidden
    tab.addEventListener("mouseover", function() {
      if (tabs.offset != OFFSETS.hidden)
        tab.shift(OFFSETS.shown);
    }, false);

    // Add the search icon in the center of the tab
    let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
    img.setAttribute("src", engine.iconURI.spec);
    tab.appendChild(img);

    // Wait for the image to load to detect colors
    img.addEventListener("load", function() {
      let color = getDominantColor(img);
      function rgb(a) "rgba(" + color + "," + a +")";

      // Set a radial gradient that makes use of the dominant color
      let gradient = ["top left", "farthest-corner", rgb(.3), rgb(.5)];
      tab.style.backgroundImage = "-moz-radial-gradient(" + gradient + ")";

      // Add a border with the dominant color
      tab.style.boxShadow = "0 0 20px " + rgb(1) + " inset, 0 0 5px black";
    }, false);

    // Figure out what comes before and after the query
    const dummy = "DUMMY_STRING_FOR_SUBMISSION";
    let {spec} = engine.getSubmission(dummy).uri;
    let parts = spec.split(dummy);
    tabs.engineParts.push({
      prefix: parts[0],
      suffix: parts[1],
      tab: tab,
    });
  });

  // Display the icons for a little on startup then hide
  async(function() {
    // Only hide if still showing everything
    if (tabs.offset == OFFSETS.shown)
      tabs.shiftAll(OFFSETS.hidden);
  }, 5000);

  // Handle events by checking if search tabs should show
  function checker({originalTarget}) {
    // Merge multiple checks into one
    if (checker.timer != null)
      return;

    // Figure out what window object to use for checking
    let doc = originalTarget;
    if (doc.nodeName != "#document")
      doc = doc.ownerDocument;

    // Only care about events for the current tab
    let targetWindow = (doc == null ? null : doc.defaultView) || window;
    if (targetWindow.top != gBrowser.selectedBrowser.contentWindow)
      return;

    // Delay checking just a little bit to allow for merging
    checker.timer = async(function() {
      checker.timer = null;

      // Process each checker in order and get the first match
      let value;
      checker.callbacks.some(function(callback) {
        // Skip this callback if the pref says to
        if (!pref(callback.name))
          return;

        value = callback(targetWindow) || "";
        return value != "";
      });

      // Show or hide based on if the checkers found anything
      tabs.shiftAll(value == "" ? OFFSETS.hidden : OFFSETS.partial);
      checker.value = value;
    }, 100);
  }

  // Add various callbacks to check if something can be searched
  checker.callbacks = [
    // Figure out if there's any selected text in the appropriate context
    function checkSelection(targetWindow) {
      return String.trim(targetWindow.getSelection());
    },

    // Check if an input box is selected with text
    function checkInput() {
      let {focusedElement} = document.commandDispatcher;
      let {nodeName, type, value} = focusedElement || {};
      if (nodeName == null ||
          nodeName.search(/^(html:)?input$/i) == -1 ||
          type.search(/^text$/i) == -1) {
        return;
      }
      return value;
    },

    // See if the current tab is on a search engine's result page
    function checkLocation() {
      let nav = gBrowser.selectedBrowser.webNavigation;
      let uri = nav.currentURI;
      let chan = nav.documentChannel || nav.currentDocumentChannel;
      if (chan != null)
        uri = chan.originalURI;
      return tabs.extractQuery(uri.spec);
    },
  ];

  // Look for various events to detect focus or selection change
  listen(window, "focus", checker);
  listen(window, "keyup", checker);
  listen(window, "mouseup", checker);
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  // Load various javascript includes for helper functions
  ["helper", "prefs", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Initialize the add-on UI
  (function init() {
    // Reload the interface when certain prefs change
    pref.observe(["hideSearchbar"], function() {
      unload();
      init();
    });

    // Load style files that get automatically unloaded
    loadStyles(addon, ["browser"]);

    // Add search tabs with colors
    watchWindows(addSearchTabs);
  })();
})


/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
