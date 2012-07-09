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
 * The Initial Developer of the Original Code is the Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011 the
 * Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

const file = require("file");
const widgets = require("widget");
const tabs = require("tabs");
const request = require("request");
const timers = require("timers");
const windows = require("windows");
const panel = require("panel");
const simpleStorage = require("simple-storage");
const preferences = require("preferences-service");
const {PageMod} = require("page-mod");
const {data} = require("self");
const passwords = require("passwords");

const {Cc,Ci,Cm,Cr,Cu,components} = require("chrome");

Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/PlacesUtils.jsm", this);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", this);
Cu.import("resource://gre/modules/Services.jsm", this);

function GoogleMapper( mapFile , appFile ) {
	this.mappings = {};
	this.googleCats = {};
	this.googleApps = {};
	this.randomMap = [ ];	
    this.mapFile = mapFile;
    this.appFile = appFile;
	this.readMappings( );
	this.readApps( );
	//this.genGoogleAppDump( );

}

GoogleMapper.prototype = {

  clear: function( ) {
  	this.mappings = {};
	this.googleCats = {};
  },

  getMappings: function ( ) { return this.googleCats; } ,

  readMappings: function ( ) {
  		// read the file first
		let fileContent = data.load( this.mapFile );
		// split by new lines
		fileContent.split( /\n/ ).forEach( function( line ) {
				// figure site , rank and cat
				let data = line.split( / / );
				let odpCat = data.shift( );
				if( odpCat == "" ) return;   // empty odpCat
				var vector = {};
				this.mappings[ odpCat ] = vector;

			    //siteFoo.rank = data[1];
				data.forEach( function( item ) {
					let pair = item.split( /:/ );
					vector[ pair[0] ] = pair[1];
					this.googleCats[ pair[0] ] = 0;
				}.bind( this ));

		 }.bind(this));
		 //console.log( JSON.stringify( this.mappings ) );
  },

  readApps: function( ) {
        let fileContent = data.load( this.appFile );
        // split by new lines
        fileContent.split( /\n/ ).forEach( function( line ) {
                // figure site , rank and cat
                let data = line.split( " _XXXX_ " );
                let googleCat = data.shift( );
                if( googleCat == "" ) return;   // empty cat
				if( this.googleApps[ googleCat ] == null ) {
					this.googleApps[ googleCat ] = [ ];
				}

				if( 
				    data[2].indexOf( "Sex" ) != -1 ||
				    data[2].indexOf( "Sexy" ) != -1 ||
				    data[3].indexOf( "Sexy" ) != -1 ||
				    data[3].indexOf( "Sexy" ) != -1 ||
				    data[2].indexOf( "sex" ) != -1 ||
				    data[2].indexOf( "sexy" ) != -1 ||
				    data[3].indexOf( "amasutra" ) != -1 ||
				    data[3].indexOf( "sexy" ) != -1 ||
				    data[3].indexOf( "sexy" ) != -1 
				  ) {
				    return;
				  }

				this.googleApps[ googleCat ].push( 
					{
					    cat: googleCat ,
						url: data[0] ,
						img: data[1] ,
						title: data[2] ,
						descr: data[3]
					}
				);

         }.bind(this));

		 // console.log( JSON.stringify( this.googleApps ) );
  },

  odpMap: function( odpVector ) {
  		this.googleCats = {};	
  		this.randomMap = [ ];	
		let total = 0;
		Object.keys( odpVector ).forEach( function( odpCat ) {
			let weight  = odpVector[ odpCat ].vcount;
			let theCat = this.mappings[ odpCat ];
			if( typeof theCat != "object" ) return;
			Object.keys( theCat ).forEach( function (googCat) {

			    if( ! googCat || googCat == "" ) return ;

				if( this.googleCats[ googCat ]  == null ) {
					this.googleCats[ googCat ]  = 0;
				}

				if( theCat[googCat] != null ) {
					this.googleCats[ googCat ] += weight * theCat[googCat];
					total += weight * theCat[googCat];
				}

			}.bind( this ));
		}.bind( this ));

		Object.keys( this.googleCats ).sort( function( a , b ) {
			return this.googleCats[ b ] - this.googleCats[ a ];
		}.bind(this)).forEach( function ( googCat ) {
		    let val = Math.round( this.googleCats[ googCat ] * 100 / total ) || 1; 
			this.googleCats[ googCat ] = val;
			//console.log( googCat , this.googleCats[ googCat ] );
			while( val > 0 ) {
				this.randomMap.push( googCat );
				val --;
			}
		}.bind( this ));

		console.log( "RANDOM MAP " + this.randomMap.length );
  },


  getCatData: function( cat , free ) {
      let url = "https://play.google.com/store/apps/category/" + cat + "/collection/topselling_" + free;
	  var loader = panel.Panel( {
	  	contentURL: url ,
		contentScriptFile: [data.url("jquery-1.7.2.js"), data.url("loader.js")] ,
		contentScriptWhen: "end" 
	  });

	  loader.port.on( "found" , function( ref , img , title , descr ) {
	    descr = descr.replace( /\n/g , " " );
	  	console.log( cat + " _XXXX_ " + ref  + " _XXXX_ " + img + " _XXXX_ " + title + " _XXXX_ " + descr );

	  });

	 panel.destroy( );

  },

  genGoogleAppDump: function( ) {
  		
		Object.keys( this.googleCats ).forEach( function ( cat ) {
			if( cat == "" ) return;
			this.getCatData( cat , "free" );
			this.getCatData( cat , "paid" );
		}.bind( this ));

   },

   suggest: function( ) {
   		// get the random index
		let catIndex = Math.floor( Math.random( ) * this.randomMap.length );
		let gCat = this.randomMap[ catIndex ];
		let objIndex = Math.floor( Math.random( ) * this.googleApps[gCat].length );

		let obj = this.googleApps[gCat][objIndex];

        console.log( "HERE " , gCat , objIndex );
		//console.log( JSON.stringify( obj ) );
		return obj;
   },

}


exports.GoogleMapper = GoogleMapper;


