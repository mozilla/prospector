/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2012
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *   Maxim Zhilayev <mzhilyaev@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
const {Ci,Cu,Cc} = require("chrome");
const tabs = require("tabs");
const {makeWindowHelpers} = require("makeWindowHelpers");
const {unload} = require("unload+");
const {watchWindows} = require("watchWindows");
const {AppViewer} = require("appViewer");
const {PageMod} = require("page-mod");
const {data} = require("self");
const {listen} = require("listen");
const simplePrefs = require("simple-prefs");
const file = require("file");
const {XMLHttpRequest} = require("xhr");
const timers = require("timers");

Cu.import("resource://gre/modules/Services.jsm", this);
const PromptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
const ObserverService = require("observer-service");
const {Demographer} = require("Demographer");

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

//  listen( window , div , "click" , function(event) {
//			console.log( "CLICKED DIV" );
//     } );

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
  }

}


exports.main = function(options) {
try {

    // per-window initialization
    watchWindows(function(window) {
    // let {change, createNode, listen, unload} = makeWindowHelpers(window);
    let {gBrowser} = window;

    // Listen for tab content loads.
	tabs.on('ready', function(tab) {
		if( tabs.activeTab.url == "about:newtab" ) {
			addAppsButton( window , gBrowser );
		}
	});

  });

}
catch ( ex ) {

	console.log( "ERROR" + ex );

}
}
