/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const file = require("file");
const widgets = require("widget");
const tabs = require("tabs");
const request = require("request");
const timers = require("timers");
const windows = require("windows");
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

const historyUtils = require("HistoryUtils");

function Demographer( sitesCatFile ) {

    this.catFile = sitesCatFile;

    this.totalVisits = 0;
    this.catDepth = 2;

    this.allSites = {};
    this.mySites = {};
    this.cats = {};
    this.readCats( );
    this.readHistory( );
}

Demographer.prototype = {

  clearCats: function( ) {
    this.totalVisits = 0;
    this.cats = {};
  },

  rebuild: function ( cb ) {
    this.clearCats( );
    this.mySites = {};
    this.readHistory( cb );
  },

  extractDomain: function ( url ) {

    // now we need to grep the domain 
    let domain = require("url").URL( url ).host;

    // and make sure to get rid of www
    let re = /^www[.]/;
    domain = domain.replace( re , "" );

    // ok check if site is present in our global site list
    let siteData = this.allSites[ domain ];

    while( ! siteData ) {  // attempt to go to the root domain

         domain = domain.replace( /^[^.]+[.]/ , "" );
         if( domain.indexOf( "." ) <  0) {
             domain  = null;
             break;
         }  // no need to go further
         siteData = this.allSites[ domain ];
    }

    return ( siteData ) ? domain : null;
  },

  readHistory: function ( cb ) {

    let query = "select visit_count , url from moz_places where visit_count >= 1";
    historyUtils.executeHistoryQuery( query , null , 
       {
         onRow: function ( row ) {

            let vcount = row.getResultByIndex( 0 );
            let url = row.getResultByIndex( 1 );

            // now we need to grep the domain 
            let domain = this.extractDomain( url );
            if( ! domain ) return;   // bail if domain is empty

            let site = this.mySites[ domain ];
            if( !this.mySites[ domain ] ) {
                this.mySites[ domain ]  = 0;
            }
            this.mySites[ domain ] += vcount;

          }.bind( this ) ,

        onCompletion: function ( reason ) {
            this.computeSitesData( );
            if( cb ) {
                cb( );  // execute call back
            }
        }.bind( this ) ,

        onError: function ( error ) {
            console.log( error );
        }.bind( this ) ,
     });
  },

  computeSitesData: function( ) {
    for ( domain in this.mySites ) {
        this.processHistorySite( domain );
    }
    this.normalize( );
  },

  processHistorySite: function( domain ) {

    // ok check if site is present 
    let siteData = this.allSites[ domain ];
    let vcount = this.mySites[ domain ];

    if( ! siteData || !vcount || vcount == 0 ) return;   // domain is not found

    vcount = Math.log( vcount );  // log the count

    // add it to the soup
    if( siteData.cats ) {

        let addedHash = {};
        siteData.cats.forEach( function ( category ) {
            this.addToCategory( domain , category , vcount , addedHash );
        }.bind( this ));
        this.totalVisits += vcount;
    } 

  },

  addToCategory: function( domain , cat , count , addedHash ) {

    // for now simply take the top ones
    let them = cat.split( "/" );
    let top = them.shift( );
    let depth = 1;
    while( them.length && depth < this.catDepth ) {
        top += "/" + them.shift( );
        depth ++;
    }

    // check if we saw this category already
    if( addedHash[ top ] ) {
        return;
    } 

    addedHash[ top ] = 1;
    if( ! this.cats[ top ]  ) { 
        this.cats[ top ] = 0;
    }
    this.cats[ top ] += count;

  },

  readCats: function ( ) {
      // read the file first
      let sites = data.load( this.catFile );
      // split by new lines
      sites.split( /\n/ ).forEach( function( line ) {
              // figure site , rank and cat
              let data = line.split( / / );
              let domain = data.shift( );
              if( domain == "" ) return;   // empty domain
              let site = this.allSites[ domain ];
              if( site  == undefined  ) {
                  site = {};
                  site.cats = [];
                  this.allSites[ domain ] = site;
              }
              //siteFoo.rank = data[1];
              data.forEach( function( item ) {
                  if( item && item != "" && item.indexOf("Regional") != 0 ) {
                      site.cats.push( item );
                  }
              });

              if( site.cats.length == 0 ) {
                  delete this.allSites[ domain ];
              }

       }.bind(this));
  },

  getInterests: function( ) {

      return this.cats;

  },

  normalize: function( ) {

    Object.keys( this.cats ).forEach( function ( key ) {
        this.cats[ key ]  =  this.cats[ key ] * 100.0 / this.totalVisits ;
        if( this.cats[ key ] < 0.001 ) {
          delete this.cats[ key ];
        }
    }.bind( this ));

  },

}


exports.Demographer = Demographer;


