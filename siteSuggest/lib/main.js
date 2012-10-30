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
  let theTab = tabGrid.querySelector(".newtab-row:last-child").querySelector(".newtab-cell:last-child");
  let site = theTab.querySelector(".newtab-site");
  let ref = site.getElementsByTagName("a")[0];
  let spanImage = site.querySelector(".newtab-thumbnail");
  let spanTitle = site.querySelector(".newtab-title");
  let spanCatTitle = spanTitle.cloneNode(false);

  theTab.setAttribute("style" , "box-shadow: 0 0 5px orange, 0 0 10px orange;");
  ref.setAttribute( "style" , "overflow: hidden;");
  spanCatTitle.setAttribute( "style" , "transition-property: margin-bottom; transition-duration: 1s; margin-bottom: -20px;");
  ref.appendChild(spanCatTitle);

  let window = document.defaultView;
  let nesting = 0;

  // Add a row and cell for the showing the app frame
  gUserProfile.demographer.pickRandomBest(function suggestCat(cat) {
     let toggle = false;
     let req = request.Request({
          url: "https://sitesuggest.mozillalabs.com/" ,
          headers: { "Category": cat },
          onComplete: function(response) {
            if( response.status == 200 ) {
              ref.setAttribute('title', response.json.title);
              ref.setAttribute('href', response.json.url);
              spanImage.setAttribute('style','background-image: url("' + response.json.image + '");');
              spanTitle.textContent = response.json.title;
              spanCatTitle.textContent = "Your interest: " + cat;
              window.setInterval(function keepLoading() {
                if( toggle ) {
                  spanCatTitle.setAttribute( "style" , "transition-property: margin-bottom; transition-duration: 1s; margin-bottom: -20px;");
                  toggle = false;
                }
                else {
                  spanCatTitle.setAttribute( "style" , "transition-property: margin-bottom; transition-duration: 1s; margin-bottom: 0px;");
                  toggle = true;
                }
              },3000);
            }
            else if( nesting < 3) {
              nesting++;
              gUserProfile.demographer.pickRandomBest(suggestCat);
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
