/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const {Class} = require("api-utils/heritage");
const {data} = require("self");
const {Demographer} = require("Demographer");
const {Factory, Unknown} = require("api-utils/xpcom");
const {PageMod} = require("page-mod");
const tabs = require("tabs");

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

exports.main = function(options, callbacks) {
  // Create demographer
  let demographer = new Demographer("SiteToOdp.txt", "demog2K.txt");

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
                           demographer.getTotalAcross());
          worker.port.emit("show_demog",
                           demographer.getDemographics());
        });
      });
    }
  });

  // Automatically open a tab unless it's a regular firefox restart
  if (options.loadReason != "startup") {
    tabs.open("about:profile");
  }
};
