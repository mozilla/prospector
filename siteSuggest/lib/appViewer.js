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
 * The Original Code is NewTab.
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
const {Ci,Cu} = require("chrome");
const {makeWindowHelpers} = require("makeWindowHelpers");
const {unload} = require("unload+");
const {watchWindows} = require("watchWindows");
const {trace} = require("dumper");
const {listen} = require("listen");
const {data} = require("self");
const file = require("file");
const {XMLHttpRequest} = require("xhr");
const timers = require("timers");
const simplePrefs = require("simple-prefs");

Cu.import("resource://gre/modules/Services.jsm", this);
const XHTML_NS = "http://www.w3.org/1999/xhtml";


function AppViewer( configObject ) {
try{
    this._window = configObject.window;
	this._document = configObject.document;
	this._backGroundElement = configObject.bElement;
	this._demographer = configObject.demographer;

    //let {change, createNode, listen, unload} = makeWindowHelpers(this._window);
	let div  = this._document.getElementById( "newtab-vertical-margin");

	let iframe = this._document.createElementNS(XHTML_NS, "iframe");
	iframe.setAttribute( "type" , "content" );
    iframe.style.left = "-1000px";
    iframe.style.top = "36px";
    iframe.style.width = "85%";
    iframe.style.height = "90%";
	iframe.style.position = "absolute";
	iframe.style.background = "white";

    iframe.style.boxShadow = "5px 5px 10px black";
    iframe.style.borderRadius = "10px 10px 10px 10px";

	//iframe.style.MozTransitionProperty = "left";
	//iframe.style.MozTransitionDuration = "2s";

	// remove the border pixels
	iframe.style.borderWidth = "0px";
	iframe.style.borderLeftWidth = "0px";
	iframe.style.borderRightWidth = "0px";
	iframe.style.borderTopWidth = "0px";
	iframe.style.borderBottomWidth = "0px";

	// now that we have iframe, let's install apis into it
    var apiInjector = function(doc, topic, data) {
	try {
		// make sure that it's our iframe document that has been inserted into iframe
		if( !doc.defaultView || doc.defaultView != iframe.contentWindow) {
		          return;  // so it was not
	    }
		console.log( "caught document insertion" );
		Services.obs.removeObserver(apiInjector, 'document-element-inserted', false);

		iframe.contentWindow.wrappedJSObject.getCategories = function( callback ) {   
			callback( this._demographer.getInterests( ) );
		}.bind( this );

		iframe.contentWindow.wrappedJSObject.rebuildInterests = function( ) {   
			this._demographer.rebuild( );
		}.bind( this );

        iframe.contentWindow.wrappedJSObject.getDemographics = function( callback ) {   
                 callback( {} );
        }

	  } catch (ex) {  console.log( "ERROR " + ex ); }
	}.bind( this );
	Services.obs.addObserver( apiInjector , 'document-element-inserted', false);

	//iframe.src = "https://myapps.mozillalabs.com";
	iframe.src = (simplePrefs.prefs.apps_page_url || data.url( "newtab_test.html" ));
	//iframe.src = data.url( "newtab_test.html" );
	// insert doc into the thing
	div.parentNode.insertBefore(iframe, div.nextSibling)

	// move left to clientWidth
	iframe.style.left =  "-" + iframe.clientWidth + "px";
	this._iframe = iframe;
	this._shown = false;

	var self = this;
    iframe.onload = function ( event ) {
		console.log( "loaded" );
		iframe.contentWindow.addEventListener("click", function( event ) {
	        console.log("iframe clicked");
			if( self._shown == false ) {
				self.show( );
			}
	   });
	   self.hide( );
	};

	iframe.contentWindow.onresize = function ( event ) {
		self.resize( );
	};

    /*** this is no loger needed, since we have buttons coltrooling hide/show 
	//
	this._backGroundElement.addEventListener("click", function(event) {
	        console.log( "CLICKED DIV" );
			if( self._shown == true ) {
				self.hide( );
			}
      } );
	 ****/

} catch ( ex ) {

    console.log( "ERROR" + ex );

}
}

AppViewer.prototype = {
    show: function () {
	try {
		let baseWidth = this._backGroundElement.clientWidth;
		let leftExtent = ( baseWidth - this._iframe.clientWidth ) / 2;
		this._shown = true;
		//this._iframe.style.visibility = "visible";
		this._iframe.style.MozTransitionProperty = "left";
		this._iframe.style.MozTransitionDuration = "1s";
		this._iframe.style.left = leftExtent + "px";
		this._backGroundElement.style.opacity = "0.5";
		} catch( ex ) { console.log( "ERROR" + ex ); }
    } ,

    hide: function () {
	try {
		//let baseWidth = this._backGroundElement.clientWidth;
		let leftExtent = this._iframe.clientWidth + 10;
		this._iframe.style.left = "-" + leftExtent + "px";

		this._window.setTimeout(  function( ) {
			this._iframe.style.MozTransitionProperty = "";
			this._iframe.style.MozTransitionDuration = "";
			this._backGroundElement.style.opacity = "";
			//this._iframe.style.visibility = "hidden";
			this._shown = false;
		}.bind( this ) , 1000 );
		} catch( ex ) { console.log( "ERROR" + ex ); }
    } ,

	resize: function( ) {
	    console.log( "in resize" );
		if( this._shown == true ) return;
		let leftExtent = this._iframe.clientWidth - 40;
        this._iframe.style.left = "-" + leftExtent + "px";
	},
}

exports.AppViewer = AppViewer;
