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
 * The Original Code is LessChrome HD.
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
Cu.import("resource://services-sync/ext/Observers.js");

// Fix up the current window state and get ready to hide chrome
function prepareLessChrome(window) {
  let {async, change} = makeWindowHelpers(window);
  let {document, gBrowser, gNavToolbox} = window;

  // Make sure tabs are on top
  change(window.TabsOnTop, "enabled", true);

  // Always don't hide chrome by collapsing
  change(window.XULBrowserWindow, "hideChromeForLocation", function(orig) {
    return function() false;
  });

  // Make sure the current tab didn't cause chrome to hide
  document.documentElement.removeAttribute("disablechrome");

  // Make sure the Firefox app menu is clickable even when maximized
  let appMenu = document.getElementById("appmenu-button");
  if (appMenu != null) {
    appMenu.style.position = "relative";
    appMenu.style.zIndex = 1;
  }

  // Similarly make sure the min/max/close buttons are clickable
  let titleBoxes = document.getElementById("titlebar-buttonbox");
  if (titleBoxes != null) {
    titleBoxes.style.position = "relative";
    titleBoxes.style.zIndex = 1;
  }

  // Copy the active lightweight theme if there's one set
  let MainWindow = document.getElementById("main-window");
  function updateTheme() {
    let {style} = gNavToolbox;
    style.backgroundImage = MainWindow.style.backgroundImage;
    style.backgroundPosition = "right -" + gNavToolbox.boxObject.y + "px";
  }
  updateTheme();

  // Watch for theme changes to update the image and cleanup as necessary
  Observers.add("lightweight-theme-changed", updateTheme);
  unload(function() {
    Observers.remove("lightweight-theme-changed", updateTheme);
    gNavToolbox.style.backgroundImage = "";
    gNavToolbox.style.backgroundPosition = "";
  });

  // Figure out how much to shift the main browser
  let MainBrowser = document.getElementById("browser");
  let TabsBar = document.getElementById("TabsToolbar");
  MainBrowser.style.marginTop = TabsBar.boxObject.y + TabsBar.boxObject.height -
    gBrowser.parentNode.boxObject.y + "px";

  // Hide toolbars by changing the height and keep it above content
  gNavToolbox.style.overflow = "hidden";
  gNavToolbox.style.position = "relative";

  // Reset the UI to what it looked like before activating
  unload(function() {
    if (appMenu != null) {
      appMenu.style.position = "";
      appMenu.style.zIndex = "";
    }

    if (titleBoxes != null) {
      titleBoxes.style.position = "";
      titleBoxes.style.zIndex = "";
    }

    MainBrowser.style.marginTop = "";
    gNavToolbox.style.height = "";
    gNavToolbox.style.marginBottom = "";
    gNavToolbox.style.overflow = "";
    gNavToolbox.style.position = "";
  });

  // Keep track of various states and modifiers of events
  let hidden = false;
  let ignoreMouse = false;
  let keepOpen = false;
  let popupOpen = false;
  let skipClick = false;

  // Show the chrome immediately
  function show() {
    // Prevent any pending hides now that we want to show
    cancelDelayed();

    // Nothing to do if already showing
    if (!hidden)
      return;

    // Stop any in-progress animations
    cancelShifter();
    hidden = false;

    // Show the full height without any filler height
    gNavToolbox.style.height = gNavToolbox.scrollHeight + "px";
    gNavToolbox.style.marginBottom = 0;
  }

  // Hide the chrome by animating away the non-tabs toolbar area
  function hide() {
    // Don't bother hiding if already hidden or showing nothing
    if (hidden || keepOpen || popupOpen || showingNothing())
      return;

    // Stop any previous animations before starting another
    cancelShifter();
    hidden = true;

    // Figure out how tall various pieces are
    let total = gNavToolbox.scrollHeight;
    let tabs = TabsBar.boxObject.height;
    let other = total - tabs;

    // Keep track of the animation progress
    let startTime = Date.now();

    // Do all steps on a timer so that show-hide-show won't flicker
    (function shiftStep() shifter = async(function() {
      // Start a little slow then speed up
      let step = Math.pow(Math.min(1, (Date.now() - startTime) / 150), 1.5);

      // Shrink the visible height while maintaining the overall height
      gNavToolbox.style.height = tabs + other * (1 - step) + "px";
      gNavToolbox.style.marginBottom = other * step + "px";

      // Prepare the next step of the animation
      if (step < 1)
        shiftStep();
      // Otherwise we're done!
      else
        shifter = null;
    }))();
  }

  // Clicking the page content dismisses the chrome
  listen(window, gBrowser, "click", function({button}) {
    if (button != 0)
      return;

    hide();
  });

  // Typing in the page content dismisses the chrome
  listen(window, gBrowser, "keypress", function() {
    hide();
  });

  // Moving the mouse down into content can hide the chrome
  listen(window, gBrowser, "mousemove", function({clientY}) {
    // Allow clicks to toggle now that it moved away to content
    skipClick = false;

    // Keep ignoring mouse moves unless moving more than slightly away
    if (ignoreMouse && clientY > 30)
      ignoreMouse = false;

    // Don't bother hiding if it shouldn't hide now
    if (hidden || popupOpen || keepOpen)
      return;

    // Only hide if the mouse moves far down enough
    if (clientY > gNavToolbox.boxObject.height + 30)
      delayHide(1000);
  });

  // Show some context when switching tabs
  listen(window, gBrowser.tabContainer, "TabSelect", function({target}) {
    // Avoid toggling if a tab was clicked to select
    skipClick = true;

    // Immediately show the chrome for context on tab switch
    show();

    // Force the chrome to stay visible in-case chrome blurred
    async(function() {
      show();

      // Wait a few seconds before hiding the url/security context
      delayHide(3000);
    });
  });

  // Hide the chrome when potentially moving focus to content
  listen(window, gNavToolbox, "blur", function() {
    // Start the hide animation now, and an immediate focus will cancel
    keepOpen = false;
    hide();
  });

  // Detect focus events for the location bar, etc. to show chrome
  listen(window, gNavToolbox, "focus", function() {
    // Make sure to keep the chrome available even when pointing away
    keepOpen = true;
    show();
  });

  // Allow toggling the chrome when clicking the tabs area
  listen(window, TabsBar, "click", function({button, originalTarget}) {
    // Make sure to ignore movement after potentially hiding
    ignoreMouse = true;

    // Ignore this click if it's on certain elements
    if (originalTarget.className.search(/^scrollbutton-(down|up)$/) == 0)
      skipClick = true;

    // Only handle primary clicks and ignore one click if necessary
    if (button != 0 || skipClick) {
      skipClick = false;
      return;
    }

    // Toggle to the other state
    if (hidden)
      show();
    else
      hide();
  });

  // Show chrome when the mouse moves over the tabs
  listen(window, TabsBar, "mousemove", function() {
    // Don't show after the tabs area was clicked
    if (ignoreMouse)
      return;

    show();
  });

  // Any mouse scrolls hide the chrome
  listen(window, window, "DOMMouseScroll", function() {
    // Allow scrolling on tabs area to hide without reshowing
    ignoreMouse = true
    hide();
  });

  // Detect movement out of the browser area (including to the empty tab area)
  listen(window, window, "mouseout", function({relatedTarget}) {
    if (relatedTarget != null)
      return;

    show();
  });

  // Remember when the popup hides to allow events to resume
  listen(window, window, "popuphiding", function() {
    popupOpen = false;
  });

  // Show chrome with the context menu appearing
  listen(window, window, "popupshowing", function({target}) {
    // Ignore some kinds of popups
    if (target.nodeName.search(/(page|select|tooltip|window)$/i) == 0 ||
        target.id.search(/(autoscroller|PopupAutoComplete)$/i) == 0) {
      return;
    }

    // Prevent various events when the popup is open
    popupOpen = true;
    skipClick = true;

    show();
  });

  // Keep references to various timers and provide helpers to cancel them
  let delayedHide;
  function cancelDelayed() {
    if (delayedHide == null)
      return;

    delayedHide();
    delayedHide = null;
  }

  let shifter;
  function cancelShifter() {
    if (shifter == null)
      return;

    shifter();
    shifter = null;
  }

  // Allow hiding after a little wait
  function delayHide(wait) {
    // Let a duplicate delay finish
    if (delayedHide != null) {
      if (delayedHide.wait == wait)
        return;

      // Otherwise cancel the other one for a new timer
      delayedHide();
    }

    // Hide then clear the timer
    delayedHide = async(function() {
      hide();
      delayedHide = null;
    }, wait);

    // Remember what kind of delayed wait this is
    delayedHide.wait = wait;
  }

  // Check if the current tab is blank
  function showingNothing() {
    return gBrowser.selectedBrowser.currentURI.spec == "about:blank";
  }
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

  // Get ready to hide some of the chrome!
  watchWindows(prepareLessChrome);
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
