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
 * The Original Code is OneLiner.
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
const global = this;

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

// Keep a reference to various packaged images
const images = {};

// Define how wide the urlbar should be
const URLBAR_WIDTH = 400;

// Combine the navigation and tabs into one line
function makeOneLine(window) {
  let {async, change, createNode, listen, unload} = makeWindowHelpers(window);
  let {document, gBrowser, gURLBar} = window;

  // Get aliases to various elements
  let [commands,
       navBar, tabsBar,
       backForward, urlContainer, reload, stop,
       backCmd, forwardCmd] =
    ["mainCommandSet",
     "nav-bar", "TabsToolbar",
     "unified-back-forward-button", "urlbar-container", "reload-button", "stop-button",
     "Browser:Back", "Browser:Forward",
    ].map(function(id) document.getElementById(id));

  // Save the order of elements in the navigation bar to restore later
  let origNav = Array.slice(navBar.childNodes);

  // Create a new search button that can prefill the search input box
  let search = createNode("toolbarbutton");
  search.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
  search.setAttribute("image", images.search16);
  search.addEventListener("command", function() {
    let browser = gBrowser.selectedBrowser;

    // See if we should copy over the value in the input when searching
    let prefill = gURLBar.value.trim();
    if (prefill.search(/[:\/\.]/) != -1)
      prefill = "";

    // Check for a focused plain textbox
    let {focusedElement} = document.commandDispatcher;
    let {nodeName, type, value} = focusedElement || {};
    if (prefill == "" &&
        focusedElement != gURLBar.inputField &&
        nodeName != null &&
        nodeName.search(/^(html:)?input$/i) == 0 &&
        type.search(/^text$/i) == 0) {
      prefill = value.trim();
    }

    // Check the page for selected text
    if (prefill == "")
      prefill = browser.contentWindow.getSelection().toString().trim();

    // Check the clipboard for text
    if (prefill == "")
      prefill = (window.readFromClipboard() || "").trim();

    // Make sure to not replace pinned tabs
    if (gBrowser.selectedTab.pinned) {
      let tab = gBrowser.addTab("about:home");
      gBrowser.selectedTab = tab;
      browser = tab.linkedBrowser;
    }
    // Replace the tab with search
    else
      browser.loadURI("about:home");

    // Prepare about:home with a prefilled search once
    browser.focus();
    browser.addEventListener("DOMContentLoaded", function doPrefill() {
      browser.removeEventListener("DOMContentLoaded", doPrefill, false);

      // Prefill then select it for easy typing over
      let input = browser.contentDocument.getElementById("searchText");
      input.value = prefill;
      input.setSelectionRange(0, prefill.length);

      // Clear out the location bar so it shows the placeholder text
      gURLBar.value = "";
    }, false);
  }, false);

  // Move the navigation controls to the tabs bar
  let navOrder = [backForward, urlContainer, reload, stop, search];
  navOrder.reverse().forEach(function(node) {
    if (node != null)
      tabsBar.insertBefore(node, tabsBar.firstChild);
  });

  // Create a dummy backForward object if we don't have the node
  backForward = backForward || {
    boxObject: {
      width: 0,
    },
    style: {},
  };

  // Fix up some styling of the now one-line toolbar
  navBar.hidden = true;
  urlContainer.removeAttribute("flex");
  urlContainer.style.position = "relative";

  // Clean up various changes when the add-on unloads
  unload(function() {
    tabsBar.removeChild(search);
    origNav.forEach(function(node) navBar.appendChild(node));

    backForward.style.marginRight = "";
    navBar.hidden = false;
    urlContainer.removeAttribute("width");
    urlContainer.setAttribute("flex", 400);
    urlContainer.style.position = "";
  });

  // Figure out how much the back/forward button should get covered by urls
  let buttonWidth = backForward.boxObject.width / 2;
  function updateBackForward() {
    let buttons = 0;
    if (!forwardCmd.hasAttribute("disabled"))
      buttons = 2;
    else if (!backCmd.hasAttribute("disabled"))
      buttons = 1;

    // Cover up some buttons by shifting the urlbar left
    let baseWidth = (gURLBar.focused ? 2 : 1) * URLBAR_WIDTH;
    let width = baseWidth - buttonWidth * buttons;
    let offset = -buttonWidth * (2 - buttons);
    urlContainer.setAttribute("width", width);
    backForward.style.marginRight = offset + "px";
  }

  // Update the look immediately when activating
  updateBackForward();

  // Detect when the back/forward buttons change state to update UI
  change(window, "UpdateBackForwardCommands", function(orig) {
    return function(webnav) {
      orig.call(this, webnav);
      updateBackForward();
    };
  });

  // Do the custom search button command instead of the original
  listen(commands, "command", function(event) {
    if (event.target.id == "Tools:Search") {
      event.stopPropagation();
      search.doCommand();
    }
  });

  // Make sure we set the right size of the urlbar on blur or focus
  listen(gURLBar, "blur", function() updateBackForward());
  listen(gURLBar, "focus", function() updateBackForward());

  // Detect escaping from the location bar when nothing changes
  listen(gURLBar, "keydown", function(event) {
    if (event.keyCode == event.DOM_VK_ESCAPE) {
      let {popupOpen, value} = gURLBar;
      async(function() {
        // Only return focus to the page if nothing changed since escaping
        if (gURLBar.popupOpen == popupOpen && gURLBar.value == value)
          gBrowser.selectedBrowser.focus();
      });
    }
  });
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  // Load various javascript includes for helper functions
  ["helper", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Load various images to use later
  ["search16"].forEach(function(fileName) {
    images[fileName] = addon.getResourceURI("images/" + fileName + ".png").spec;
  });

  // Load various stylesheets that automatically unload
  loadStyles(addon, ["browser"]);

  // Move the navigation bar into the tabs bar
  watchWindows(function(window) {
    let {async} = makeWindowHelpers(window);

    // XXX Windows seems to reset toolbar items for new windows, so wait a bit
    async(function() makeOneLine(window));
  });

  // Detect toolbar customization to temporarily disable the add-on
  watchWindows(function(window) {
    let {listen} = makeWindowHelpers(window);

    // Disable the add-on when customizing
    listen(window, "beforecustomization", function() {
      // NB: Disabling will unload listeners, so manually add and remove below
      addon.userDisabled = true;

      // Listen for one customization finish to re-enable the addon
      window.addEventListener("aftercustomization", function reenable() {
        window.removeEventListener("aftercustomization", reenable, false);
        addon.userDisabled = false;
      }, false);
    });
  });

  // Make sure fullscreen always shows the toolbar without animation
  const AUTOHIDE_PREF = "browser.fullscreen.autohide";
  Services.prefs.setBoolPref(AUTOHIDE_PREF, false);
  unload(function() Services.prefs.clearUserPref(AUTOHIDE_PREF));

  // Make the back/forward buttons tall enough for edge-clicks in fullscreen
  watchWindows(function(window) {
    let {unload} = makeWindowHelpers(window);
    let {document} = window;

    // Increase the height extra to fill in empty space above it
    let back = document.getElementById("back-button");
    let forward = document.getElementById("forward-button");
    back.style.height = forward.style.height = "30px";
    unload(function() back.style.height = forward.style.height = "");
  });
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
