/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Ci,Cu,Cc} = require("chrome");
const {AppViewer} = require("appViewer");
const {Demographer} = require("Demographer");
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

function addAppsButton(window, browser) {
  let document = browser.contentDocument;
  if (!document) {
    return; // sanity
  }

  let hisToggle = document.getElementById("newtab-toggle");
  if (!hisToggle) {
    return; // sanity
  }

  let div = document.getElementById("newtab-vertical-margin");
  let contentWindow = browser.contentWindow;
  let appToggle = hisToggle.cloneNode(true);
  appToggle.setAttribute("id", "apps-toggle");
  appToggle.style.position = "absolute";
  appToggle.style.width = "16px";
  appToggle.style.height = "16px";
  appToggle.style.height = "16px";
  appToggle.style.top = "12px";
  appToggle.style.right = "40px";
  hisToggle.parentNode.insertBefore(appToggle, hisToggle.nextSibling);

  let toggleStateShown = false;
  let appViewer = new AppViewer({
    window: window,
    document: document,
    bElement: div,
    demographer: gUserProfile.demographer
  });

  contentWindow.onresize = function onRes(event) {
    appViewer.resize();
  };

  appToggle.onclick = function() {
    if (toggleStateShown) {
      appViewer.hide();
      toggleStateShown = false;
    }
    else {
      appViewer.show();
      toggleStateShown = true;
    }
  };

  let oldHandler = hisToggle.onclick;
  hisToggle.onclick = function() {
    appViewer.hide();
    toggleStateShown = false;
    oldHandler();
  };
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
