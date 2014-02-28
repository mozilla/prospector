/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const {Class} = require("sdk/core/heritage");
const {data} = require("sdk/self");
const {Demographer} = require("Demographer");
const {Factory, Unknown} = require("sdk/platform/xpcom");
const {on, off} = require("sdk/system/events");
const {PageMod} = require("sdk/page-mod");
const Preferences = require("sdk/simple-prefs");
const tabs = require("sdk/tabs");

const {Ci,Cu} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

exports.main = function(options, callbacks) {
  // Create demographer
  let demographer = new Demographer("categories.txt", "demographics.txt");

  // Handle about:profile requests
  Factory({
    contract: "@mozilla.org/network/protocol/about;1?what=profile",

    Component: Class({
      extends: Unknown,
      interfaces: ["nsIAboutModule"],

      newChannel: function(uri) {
        let chan = Services.io.newChannel(data.url("profile.html"), null, null);
        chan.originalURI = uri;
        return chan;
      },

      getURIFlags: function(uri) {
        return 0;
      }
    })
  });

  // Add functionality into about:profile page loads
  PageMod({
    contentScriptFile: [
      data.url("jquery/jquery.min.js"),
      data.url("jquery/jquery.jqplot.min.js"),
      data.url("jquery/jqplot.pieRenderer.min.js"),
      data.url("jquery/jqplot.donutRenderer.min.js"),
      data.url("profile.js"),
    ],

    include: ["about:profile"],

    onAttach: function(worker) {
      worker.port.on("donedoc", function() {
        worker.port.emit("style", data.url("jquery/jquery.jqplot.min.css"));

        // Make sure the demographer is done computing before accessing
        demographer.onReady(function() {
          worker.port.emit("show_cats",
                           demographer.getInterests(),
                           demographer.getTotalAcross(),
                           demographer.getIntent());
          worker.port.emit("show_demog",
                           demographer.getDemographics());
        });
      });
    }
  });

  // Watch for preference changes to detect which pages to inject APIs
  let allowedDomains;
  const ALLOWED_API_PREF = "allowedAPIDomains";
  Preferences.on(ALLOWED_API_PREF, updateAPIDomains);
  function updateAPIDomains() {
    allowedDomains = {};

    // Short circuit if there's nothing to do
    let userValue = Preferences.prefs[ALLOWED_API_PREF].trim();
    if (userValue == "") {
      return;
    }

    // Convert the array of domains to an object
    userValue.split(",").forEach(function(domain) {
      allowedDomains[domain] = true;
    });
  }
  updateAPIDomains();

  // Inject navigator.profile APIs into desired pages
  on("document-element-inserted", apiInjector = function({subject: document}) {
    // Allow injecting into certain pages
    let {defaultView, location} = document;
    if (defaultView == null || allowedDomains[location.host] == null) {
      return;
    }

    // Expose to the content of the page some profile APIs
    let {navigator} = defaultView.wrappedJSObject;
    navigator.profile = {
      __exposedProps__: {
        getCategories: "r",
        getIntent: "r"
      },

      // Allow getting categories with their percentage weighting
      getCategories: function(callback) {
        let rawData = demographer.getInterests();
        let totalCount = demographer.getTotalAcross();
        let result = {
          __exposedProps__: {}
        };

        // Compute the percent and expose them
        Object.keys(rawData).sort(function(a, b) {
          return rawData[b].vcount - rawData[a].vcount;
        }).forEach(function(category) {
          result.__exposedProps__[category] = "r";
          result[category] = rawData[category].vcount / totalCount;
        });

        callback(result);
      },

      // Allow getting recent intents
      getIntent: function(callback) {
        let rawData = demographer.getIntent();
        let result = {
          __exposedProps__: {}
        };

        // Compute the percent and expose them
        Object.keys(rawData).sort(function(a, b) {
          return rawData[b].vcount - rawData[a].vcount;
        }).forEach(function(category) {
          result.__exposedProps__[category] = "r";
          result[category] = rawData[category].vcount;
        });

        callback(result);
      }
    };
  });

  // Automatically open a tab unless it's a regular firefox restart
  if (options.loadReason != "startup") {
    tabs.open("about:profile");
  }
};

// Keep a hard reference to the observer while the add-on is running
let apiInjector;
