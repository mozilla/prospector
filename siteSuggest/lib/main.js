/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Ci,Cu,Cc} = require("chrome");
const {Demographer} = require("Demographer");
const {setTimeout} = require("timers");
const {WindowTracker} = require("window-utils");
const request = require("request");

Cu.import("resource://gre/modules/Services.jsm", this);

/**
 * User profile object
*/
function UserProfile() {
  this.demographer = new Demographer("Sites2Odp.txt");
}

const gUserProfile = new UserProfile();

function addApplicationFrame(document) {
  let tabGrid = document.getElementById("newtab-grid");
  let lastRowDiv = tabGrid.querySelector(".newtab-row:last-child");
  let tabCell = tabGrid.querySelector(".newtab-cell");

  // Add a row and cell for the showing the app frame
  gUserProfile.demographer.pickRandomBest(function(cat) {
     console.log(cat);
     let req = request.Request({
          url: "https://sitesuggest.mozillalabs.com/" ,
          headers: { "Category": cat },
          onComplete: function(response) {
            console.log( "response" , response.status );
            if( response.status == 200 ) {
              console.log(JSON.stringify(response.json));
            }
          }
        });
       req.get();
  });
}

exports.main = function(options) {
  // per-window initialization
  function onContentLoaded(event) {
    if (event.target.location == "about:newtab") {
      addApplicationFrame(event.target);
    }
  }

  // set up the window tracker
  let tracker = new WindowTracker({
    onTrack: function(window) {
      window.addEventListener("DOMContentLoaded", onContentLoaded);
    }, // end of onTrack

    onUntrack: function(window) {
      window.removeEventListener("DOMContentLoaded", onContentLoaded);
    } // end of onUntrack
  }); // end of wondow tracker
}
