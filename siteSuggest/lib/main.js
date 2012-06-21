/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Ci,Cu,Cc} = require("chrome");
const {AppViewer} = require("AppViewer");
const {Demographer} = require("Demographer");
const {setTimeout} = require("timers");
const tabs = require("tabs");
const {WindowTracker} = require("window-utils");

Cu.import("resource://gre/modules/Services.jsm", this);

// list of hosts granted access permission to apps installation list
const MOZAPP_PAGES_WHITE_LIST = [
  "https://newnewtab.mozillalabs.com/",
  "https://newnewtab-dev.mozillalabs.com/",
  "https://newnewtab-stage.mozillalabs.com/"
];

/**
 * User profile object
*/
function UserProfile() {
  this.demographer = new Demographer("Sites2Odp.txt");
}

const gUserProfile = new UserProfile();

function addApplicationFrame(window, browser) {
  let document = browser.contentDocument;
  let tabGrid = document.getElementById("newtab-grid");
  let lastRowDiv = tabGrid.querySelector(".newtab-row:last-child");
  let tabCell = tabGrid.querySelector(".newtab-cell");

  // Add a row and cell for the showing the app frame
  let appDiv = lastRowDiv.cloneNode(false);
  let appCell = tabCell.cloneNode(false);
  appDiv.setAttribute("id", "appstab-row");
  appDiv.appendChild(appCell);

  // Add the viewer frame into the cell
  new AppViewer({
    demographer: gUserProfile.demographer,
    document: document,
    parentElement: appCell,
    window: window,
  });

  // Show the new last row in place of the old last row
  lastRowDiv.parentNode.insertBefore(appDiv, lastRowDiv.nextSibling);
  lastRowDiv.style.display = "none";

  // Pretend the newly added cell isn't a cell to not confuse the page on load
  appCell.classList.remove("newtab-cell");
  setTimeout(function() appCell.classList.add("newtab-cell"));
}

exports.main = function(options) {
  // grant permissions to manage installed apps
  // and access AppCache
  MOZAPP_PAGES_WHITE_LIST.forEach(function(host) {
    let hostUri = Services.io.newURI(host, null, null);
    Services.perms.add(hostUri, "webapps-manage", Ci.nsIPermissionManager.ALLOW_ACTION);
    Services.perms.add(hostUri, "pin-app", Ci.nsIPermissionManager.ALLOW_ACTION);
    Services.perms.add(hostUri, "offline-app", Ci.nsIPermissionManager.ALLOW_ACTION);
  });

  // per-window initialization
  let tracker = new WindowTracker({
    onTrack: function(window) {
      let {gBrowser} = window;
      // Listen for tab content loads.
      tabs.on("ready", function(tab) {
        if (tabs.activeTab.url == "about:newtab") {
          addApplicationFrame(window, gBrowser);
        }
      }); // end of tabs.on.ready
    }, // end of onTrack

    // we explicitly do nothing for onUntrack
    // there no browser XUL ui that we changed
    // while changes to new tab are conceivably
    // not critical: new tab gets replaced right away
  }); // end of wondow tracker
}
