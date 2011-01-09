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
 * The Original Code is Home Dash.
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

// Keep a reference to various packaged images
const images = {};

/**
 * Remove all existing chrome of the browser window
 */
function removeChrome(window) {
  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = val;
    unload(function() obj[prop] = orig, window);
  }

  // Make sure the navigation bar isn't hidden on pages like about:addons
  change(window.TabsOnTop, "enabled", false);

  // Wait a bit for the UI to flow to grab the right size
  Utils.delay(function() {
    let {gBrowser} = window;
    let style = gBrowser.style;
    change(style, "marginTop", -gBrowser.boxObject.y + "px");
    change(style, "position", "relative");
    change(style, "zIndex", "1");
  });
}

/**
 * Add a dashboard that shows up over the main browsing area
 */
function addDashboard(window) {
  let {document, gBrowser} = window;

  function createNode(node) {
    const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    return document.createElementNS(XUL, node);
  }

  //// Add Firefox icon + notifications layer

  let notificationBox = createNode("vbox");
  notificationBox.setAttribute("left", 0);
  notificationBox.setAttribute("top", 0);

  let fxIcon = createNode("image");
  fxIcon.setAttribute("src", images["firefox22.png"]);
  fxIcon.style.height = "22px";
  fxIcon.style.opacity = ".3";
  fxIcon.style.width = "22px";
  fxIcon.addEventListener("mouseover", function() {
    fxIcon.style.opacity = "1";
  }, false);
  fxIcon.addEventListener("mouseout", function() {
    fxIcon.style.opacity = ".3";
  }, false);
  notificationBox.appendChild(fxIcon);

  let stack = gBrowser.selectedBrowser.parentNode;
  stack.appendChild(notificationBox);
  unload(function() notificationBox.parentNode.removeChild(notificationBox), window);

  // Move the notification box whenever the tab switches
  listen(window, gBrowser.tabContainer, "TabSelect", function() {
    gBrowser.selectedBrowser.parentNode.appendChild(notificationBox);
  });

  function notifyTab(tab, callback) {
    // Check if we already have a notification for the tab
    let exists = Array.some(notificationBox.childNodes, function(icon) {
      if (icon.tab != tab)
        return false;

      // Add the callback to this tab's notification
      icon.callbacks.push(callback);
      return true;
    });
    if (exists)
      return;

    // Add an icon for the tab and track various properties
    let tabIcon = createNode("box");
    notificationBox.appendChild(tabIcon);
    let callbacks = tabIcon.callbacks = [];
    tabIcon.tab = tab;

    function updateIcon() {
      let src = getTabIcon(tab);
      if (src != updateIcon.lastSrc) {
        tabIcon.style.backgroundImage = "url(" + src + ")";
        updateIcon.lastSrc = src;
      }
    }
    updateIcon();

    tabIcon.style.backgroundColor = "rgba(0, 0, 0, .3)";
    tabIcon.style.backgroundPosition = "1px center";
    tabIcon.style.backgroundRepeat = "no-repeat";
    tabIcon.style.height = "22px";
    tabIcon.style.width = "22px";
    tabIcon.style.borderRadius = "0 100% 100% 0";

    // Add some callbacks to run when the tab is selected
    if (typeof callback == "function")
      callbacks.push(callback);
    callbacks.push(function() notificationBox.removeChild(tabIcon));

    // Run all the callbacks including removing the tab icon
    function runCallbacks() {
      callbacks.forEach(function(callback) callback());
    }

    // Run callbacks and remove notification and listeners on close or select
    callbacks.push(listen(window, tab, "TabClose", runCallbacks));
    callbacks.push(listen(window, tab, "TabSelect", runCallbacks));

    // Update the notification icon if the tab's icon changes
    callbacks.push(listen(window, tab, "TabAttrModified", updateIcon));

    // Switch to the tab when the notification icon is clicked
    tabIcon.addEventListener("click", function() {
      gBrowser.selectedTab = tab;
    }, false);
  }

  // Watch for title changes in background tabs
  listen(window, gBrowser, "DOMTitleChanged", function(event) {
    // Only care about top-level title changes
    let content = event.target.defaultView;
    if (content != content.top)
      return;

    // No need to notify for the current tab
    let tab = gBrowser._getTabForContentWindow(content);
    if (tab == gBrowser.selectedTab)
      return;

    // Don't notify or update the count if we already triggered
    const CHANGE_THRESHOLD = 3;
    let count = (tab.HDtitleChangedCount || 0) + 1;
    if (count > CHANGE_THRESHOLD)
      return;
    tab.HDtitleChangedCount = count;

    if (count == CHANGE_THRESHOLD)
      notifyTab(tab, function() tab.HDtitleChangedCount = 0);
  });

  // Watch for tabs being opened in the background
  listen(window, gBrowser.tabContainer, "TabOpen", function(event) {
    notifyTab(event.target);
  });

  // Clear out any state we set on external objects
  unload(function() {
    Array.forEach(gBrowser.tabs, function(tab) tab.HDtitleChangedCount = 0);
  });
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  Cu.import("resource://services-sync/util.js");

  // Get references to the packaged images
  ["defaultFavicon.png", "firefox22.png"].forEach(function(fileName) {
    images[fileName] = addon.getResourceURI("images/" + fileName).spec;
  });

  // Load various javascript includes for helper functions
  ["helper", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Change the main browser windows
  watchWindows(removeChrome);
  watchWindows(addDashboard);
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
