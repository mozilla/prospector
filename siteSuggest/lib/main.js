/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Ci,Cu,Cc} = require("chrome");
const {AppViewer} = require("appViewer");
const {Demographer} = require("Demographer");
const tabs = require("tabs");
const {watchWindows} = require("watchWindows");

Cu.import("resource://gre/modules/Services.jsm", this);

/**
 * User profile object 
*/
function UserProfile() {

  let profile = this;

  // create demographer
  this.demographer = new Demographer( "AlexaSites.txt" );

}

const gUserProfile = new UserProfile();

function addAppsButton( window , browser ) {

  let document = browser.contentDocument;
  if( !document ) return; // sanity
  let hisToggle = document.getElementById( "newtab-toggle");
  if( ! hisToggle ) return;   // sanity


  let div = document.getElementById( "newtab-vertical-margin");
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
  var toggleStateShown = false;
  var appViewer = new AppViewer( { 
                      window: window,
                      document: document,
                      bElement: div,
                      demographer: gUserProfile.demographer 
                    });

  contentWindow.onresize = function onRes(event) {
           appViewer.resize( );
  };

  appToggle.onclick = function( ) { 
    
    if( toggleStateShown ) { 
        appViewer.hide( );
        toggleStateShown = false;
    } else {
        appViewer.show( );
        toggleStateShown = true;
    }

  };

  var oldHandler = hisToggle.onclick;
  hisToggle.onclick = function( ) {
      appViewer.hide( );
      toggleStateShown = false;
      oldHandler( );
  }; 

}

exports.main = function(options) {

    // per-window initialization
    watchWindows(function(window) {
    let {gBrowser} = window;

     // Listen for tab content loads.
     tabs.on('ready', function(tab) {
     
        if( tabs.activeTab.url == "about:newtab" ) {
            addAppsButton( window , gBrowser );
        }

      });   // end of tabs.on.ready
  });       // end of watchWindows 

}
