/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {Ci, Cc, Cm, Cr, Cu} = require("chrome");
const {Class} = require("api-utils/heritage");
const {data} = require("self");
const {Factory, Unknown} = require("api-utils/xpcom");
const {PageMod} = require("page-mod");
const observerService = require("observer-service");
const privateBrowsing = require("private-browsing")
const {setTimeout} = require("timers");
const {storage} = require("simple-storage");
const unload = require("unload");

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const DEFAULT_AUTO_BLOCK_THRESHOLD = 7;
const DEFAULT_ONLY_BLOCK_COOKIED = true;

exports.main = function() {
  // Initialize persistent data and defaults
  if (storage.autoBlockThreshold == null) {
    storage.autoBlockThreshold = DEFAULT_AUTO_BLOCK_THRESHOLD;
  }
  if (storage.blocked == null) {
    storage.blocked = {};
  }
  if (storage.onlyBlockCookied == null) {
    storage.onlyBlockCookied = DEFAULT_ONLY_BLOCK_COOKIED;
  }
  if (storage.trackers == null) {
    storage.trackers = {};
  }

  // Do some cleaning of single-site trackers to save some space
  unload.when(function() {
    Object.keys(storage.trackers).forEach(function(tracker) {
      if (Object.keys(storage.trackers[tracker]).length == 1) {
        delete storage.trackers[tracker];
      }
    });
  });

  // Keep track of all the sites being tracked by trackers
  let allTracked = {};
  Object.keys(storage.trackers).forEach(function(tracker) {
    Object.keys(storage.trackers[tracker]).forEach(function(tracked) {
      allTracked[tracked] = true;
    });
  });

  // Detect and block trackers with a content policy
  ({
    classDescription: "about:trackers content policy",
    classID: Components.ID("d27de1fd-f2cc-4f84-be48-65d2510123b5"),
    contractID: "@mozilla.org/about-trackers/content-policy;1",
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy, Ci.nsIFactory]),

    init: function() {
      let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
      registrar.registerFactory(this.classID, this.classDescription, this.contractID, this);

      let catMan = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
      catMan.addCategoryEntry("content-policy", this.contractID, this.contractID, false, true);

      unload.when(function() {
        catMan.deleteCategoryEntry("content-policy", this.contractID, false);

        // This needs to run asynchronously, see bug 753687
        Services.tm.currentThread.dispatch(function() {
          registrar.unregisterFactory(this.classID, this);
        }.bind(this), Ci.nsIEventTarget.DISPATCH_NORMAL);
      }.bind(this));
    },

    shouldLoad: function(contentType, contentLocation, requestOrigin, context, mimeTypeGuess, extra) {
      // Return to normal behavior (even not blocking) when private browsing
      if (privateBrowsing.isActive) {
        return Ci.nsIContentPolicy.ACCEPT;
      }

      try {
        // Ignore top level browser document loads
        if (contentType == Ci.nsIContentPolicy.TYPE_DOCUMENT) {
          return Ci.nsIContentPolicy.ACCEPT;
        }

        // Ignore requests that share a base domain
        let trackerDomain = Services.eTLD.getBaseDomain(contentLocation);
        let topLevel = (context.ownerDocument || context).defaultView.top.location.host;
        let contextDomain = Services.eTLD.getBaseDomainFromHost(topLevel);
        if (trackerDomain == contextDomain) {
          return Ci.nsIContentPolicy.ACCEPT;
        }

        // We have a 3rd-party tracker, so initialize if it's new
        if (storage.trackers[trackerDomain] == null) {
           storage.trackers[trackerDomain] = {};
        }

        // Include this site as tracked and check for auto-block
        if (storage.trackers[trackerDomain][contextDomain] == null) {
          storage.trackers[trackerDomain][contextDomain] = 1;
          allTracked[contextDomain] = true;
          updateAutoBlock(trackerDomain);
        }

        // Check if this tracker should be blocked (auto or manual)
        if (storage.blocked[trackerDomain]) {
          // Don't block the connection for trackers that are tracked because
          // the user visits this site, so just block the cookies instead
          if (allTracked[trackerDomain]) {
            unCookieNext = contentLocation.spec;
            return Ci.nsIContentPolicy.ACCEPT;
          }
          return Ci.nsIContentPolicy.REJECT_REQUEST;
        }
      }
      catch(ex) {}
      return Ci.nsIContentPolicy.ACCEPT;
    },

    shouldProcess: function(contentType, contentLocation, requestOrigin, context, mimeType, extra) {
      return Ci.nsIContentPolicy.ACCEPT;
    },

    createInstance: function(outer, iid) {
      if (outer) {
        throw Cr.NS_ERROR_NO_AGGREGATION;
      }
      return this.QueryInterface(iid);
    }
  }).init();

  // Keep track of the next url that should have cookies removed
  let unCookieNext = null;

  // Watch for requests that happen immediately after accepting from shouldLoad
  observerService.add("http-on-modify-request", function(subject) {
    // Nothing to do if there's no url to uncookie
    if (unCookieNext == null) {
      return;
    }

    // Remove the cookie header for the url that matches
    let httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
    if (httpChannel.originalURI.spec == unCookieNext) {
      httpChannel.setRequestHeader("cookie", "", false);
    }

    // Always clear if we got the request or not (cache hit = no request)
    unCookieNext = null;
  });

  // Handle about:trackers requests
  Factory({
    contract: "@mozilla.org/network/protocol/about;1?what=trackers",

    Component: Class({
      extends: Unknown,
      interfaces: ["nsIAboutModule"],

      getURIFlags: function(uri) {
        return 0;
      },

      newChannel: function(uri) {
        let chan = Services.io.newChannel(data.url("trackers.html"), null, null);
        chan.originalURI = uri;
        return chan;
      }
    })
  });

  // Add functionality into about:trackers page loads
  PageMod({
    contentScriptFile: [data.url("trackers.js")],
    include: ["about:trackers"],

    onAttach: function(worker) {
      // Build a mapping of which trackers have cookies
      let cookied = {};
      Object.keys(storage.trackers).forEach(function(tracker) {
        cookied[tracker] = isCookied(tracker);
      });

      // Update the page with stored values
      worker.port.emit("show_blockCookied", storage.onlyBlockCookied);
      worker.port.emit("show_threshold", storage.autoBlockThreshold);
      worker.port.emit("show_trackers", storage.trackers, storage.blocked, cookied);

      // Allow clearing all custom settings and blockings
      worker.port.on("reset", function() {
        storage.autoBlockThreshold = DEFAULT_AUTO_BLOCK_THRESHOLD;
        storage.blocked = {};
        storage.onlyBlockCookied = DEFAULT_ONLY_BLOCK_COOKIED;
        updateAllAutoBlocked();
      });

      // Save changes to the only-block-cookied status
      worker.port.on("set_blockCookied", function(blockCookied) {
        storage.onlyBlockCookied = blockCookied;
        updateAllAutoBlocked();
      });

      // Save changes to the threshold
      worker.port.on("set_threshold", function(threshold) {
        storage.autoBlockThreshold = threshold;
        updateAllAutoBlocked();
      });

      // Save changes to the block status for a tracker
      worker.port.on("toggle_block", function(tracker) {
        storage.blocked[tracker] = +!storage.blocked[tracker];
        worker.port.emit("update_block", tracker, storage.blocked[tracker]);
      });

      // Update the auto-blocked state for all trackers
      function updateAllAutoBlocked() {
        Object.keys(storage.trackers).forEach(function(tracker) {
          // Update the UI for trackers if changed
          if (updateAutoBlock(tracker)) {
            worker.port.emit("update_block", tracker, storage.blocked[tracker]);
          }
        });
      }
    }
  });
};

/**
 * Determine if a tracker is using cookies.
 */
function isCookied(tracker) {
  return Services.cookies.countCookiesFromHost(tracker) > 0;
}

/**
 * Update the auto-blocked-ness of a tracker. Returns true if changed.
 */
function updateAutoBlock(tracker) {
  // Ignore user-set blocked values
  let oldBlocked = storage.blocked[tracker];
  if (typeof oldBlocked == "number") {
    return false;
  }

  // Check the number of tracked sites against the threshold
  let tracked = Object.keys(storage.trackers[tracker]);
  let overThreshold = tracked.length >= storage.autoBlockThreshold;
  let newBlocked = overThreshold ? "auto" : undefined;

  // Don't set auto-block if not blocking trackers without cookies
  if (storage.onlyBlockCookied && !isCookied(tracker)) {
    newBlocked = undefined;
  }

  // Change if necessary and inform if so
  if (newBlocked != oldBlocked) {
    storage.blocked[tracker] = newBlocked;
    return true;
  }
  return false;
}
