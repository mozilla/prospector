/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const widgets = require("widget");
const tabs = require("tabs");
const {data} = require("self");

const {Demographer} = require("Demographer");

function Profile() {
  let profile = this;

  widgets.Widget({
    id: "profile",
    label: "Profile",
    contentURL: data.url("icon.png"),
    onClick: function() {
      console.log("clicked");
      profile.loadControls();
    }
  });

  // create demographer
  this.demographer = new Demographer("SiteToOdp.txt", "demog2K.txt");
}

Profile.prototype = {
  loadControls: function() {
    tabs.open({
      url: data.url("profile.html"),
      onReady: function(tab) {
        let worker = tab.attach({
          contentScriptFile: [data.url("jquery/jquery.min.js"), data.url("profile.js")]
        });

        function loadData() {
          try {
            worker.port.emit("show_cats",
                             gProfile.demographer.getInterests(),
                             gProfile.demographer.getTotalAcross());
            worker.port.emit("show_demog",
                             gProfile.demographer.getDemographics());
          }
          catch(ex) {
            console.log("Error " + ex);
          }
        }

        worker.port.on("donedoc", loadData);
      },
    });
  },

  _debug: function(s) {
    if (this._trace) {
      console.debug(s);
    }
  },
};

const gProfile = new Profile();

exports.main = function(options, callbacks) {
  console.log(" in main ");
  gProfile._debug("Profile starting");
};

exports.onUnload = function(reason) {
};

exports.getProfileForUnitTest = function() {
  return gProfile;
};
