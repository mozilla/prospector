/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const {data} = require("self");
const {Demographer} = require("Demographer");
const {Factory, Unknown} = require("api-utils/xpcom");
const {PageMod} = require("page-mod");

const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

exports.main = function(options, callbacks) {
  // Create demographer
  let demographer = new Demographer("SiteToOdp.txt", "demog2K.txt");

  // Handle about:profile requests
  Factory.new({
    contract: "@mozilla.org/network/protocol/about;1?what=profile",

    component: Unknown.extend({
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

        worker.port.emit("show_cats",
                         demographer.getInterests(),
                         demographer.getTotalAcross());
        worker.port.emit("show_demog",
                         demographer.getDemographics());
      });
    }
  });
};
