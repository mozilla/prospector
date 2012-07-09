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

'use strict';

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
const {ItemJar} = require("ItemJar");
const demogBuckets = [
"age_18",
"age_25",
"age_35",
"age_45",
"age_55",
"age_65",
"no_college",
"some_college",
"college",
"graduate",
"male",
"female",
"children",
"no_children",
"home",
"school",
"work"
];

const WeightFunctionTags = [

"total_visists",
"log_total_visists",
"daily_visists",
"log_daily_visists",
"time_reverse_sum",
"time_reverse_log_sum"

];


function Demographer( sitesCatFile , sitesDemogFile  ) {
    this.catFile = sitesCatFile;
    this.demogFile = sitesDemogFile;
    this.allSites = {};
    this.mySites = {};
	this.cats = {};
	this.demog = { };
	for ( x in demogBuckets ) {
		this.demog[ demogBuckets[x] ] = { vtotal: 0 , neg: new ItemJar(5) , pos: new ItemJar(5) };
	}

	this.weighter = {
		total_visists: function( stats ) { return stats.total; },
		log_total_visists: function( stats ) { return Math.log(stats.total); },
		total_day_visists: function( stats ) { return (stats.dtotal); },
		log_total_day_visists: function( stats ) { return Math.log(stats.dtotal); },
		reverse_age_sum: function( stats ) { return stats.daysOverSum; },
		reverse_log_age_sum: function( stats ) { return stats.daysOverLogSum; },
		reverse_age_day_sum: function( stats ) { return stats.dOverSum; },
		reverse_log_age_day_sum: function( stats ) { return stats.dOverLogSum; } ,
		frecency_max: function( stats ) { return stats.frecencyMax; } ,
		frecency_sum: function( stats ) { return stats.frecencySum; } ,
		frecency_avg: function( stats ) { return stats.frecencySum * 1.0 / stats.total ; } ,
		log_frecency_max: function( stats ) { return Math.log(stats.frecencyMax); } ,
		log_frecency_sum: function( stats ) { return Math.log(stats.frecencySum); } ,
		log_frecency_avg: function( stats ) { return Math.log(stats.frecencySum * 1.0 / stats.total) ; }
	};

	this.currentWeighter = "log_total_visists";
	this.totalLimit = 1;
	this.catDepth = 2;
	this.frecencyLimit = 0;
	this.dayLimit = 300;

	this.totalAcross = 0;
	this.totalSquared = 0;

    this.misses = new ItemJar(20);

	this.readCats( );
	this.readDemographics( );
	this.readHistory( );

}

Demographer.prototype = {

  clearCats: function( ) {
  	this.cats = {};
	this.demog = { };
    for ( x in demogBuckets ) {
	        this.demog[ demogBuckets[x] ] = { vtotal: 0 , neg: new ItemJar(5) , pos: new ItemJar(5) };
    }
	this.misses = new ItemJar(20);
	this.totalAcross = 0;
	this.totalSquared = 0;
  },

  rebuild: function ( cb ) {
  	this.clearCats( );
	this.mySites = {};
	this.readHistory( cb );
	//this.computeSitesData( );
  },

  setDayLimit: function (val) { this.dayLimit = val; } ,
  getDayLimit: function () { return this.dayLimit; } ,
  setTotalLimit: function (val) { this.totalLimit = val; } ,
  getTotalLimit: function () { return this.totalLimit; } ,
  setCatDepth: function (val) { this.catDepth = val; } ,
  getCatDepth: function () { return this.catDepth; } ,
  setFrecencyLimit: function (val) { this.frecencyLimit = val; } ,
  getFrecencyLimit: function () { return this.frecencyLimit; } ,

  getWeightFunctions: function ( ) { return Object.keys( this.weighter ); } ,
  getCurrentWeightFunction: function( ) { return this.currentWeighter; } ,
  setCurrentWeightFunction: function( val) { this.currentWeighter = val; } ,

  getMissingSites: function( ) { return this.misses; } ,
  getTotalAcross: function( ) { return this.totalAcross; } ,
  getTotalDist: function( ) { return Math.sqrt(this.totalSquared); } ,

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
           //console.log( "cutting to " + domain );
           if( domain.indexOf( "." ) <  0) {
               domain  = null;
               break;
           }  // no need to go further
           siteData = this.allSites[ domain ];
      }

	  return ( siteData ) ? domain : null;
  },

  readHistory: function ( cb ) {

	//query = "select visit_count , url from moz_places where visit_count >= 1";
	console.log( this.totalLimit , this.frecencyLimit , this.dayLimit );
	let query  = "select (strftime( '%s' , 'now') - visit_date/1000000) / (60*60*24) as day_diff, " +
	             "strftime('%s' , visit_date/1000000  ,'unixepoch' ) / (60*60*24) as day , " +
				 "date( visit_date/1000000 , 'unixepoch' ) as date ," +
				 "url, " +
				 "frecency " +
				 "from moz_historyvisits , moz_places where moz_historyvisits.place_id = moz_places.id " + 
				 "and moz_places.frecency > " + this.frecencyLimit + " " +
				 "and day_diff < " + this.dayLimit + " " +
				 "order by visit_date desc";

    console.log( query );

	var s1 = Date.now();
    historyUtils.executeHistoryQuery( query , null , 
	   {
	     onRow: function ( row ) {
		   let daysPassed = row.getResultByIndex( 0 );
		   let onDay = row.getResultByIndex( 1 );
		   let date = row.getResultByIndex( 2 );
           let url = row.getResultByIndex( 3 );
           let frecency = row.getResultByIndex( 4 );

		   // now we need to grep the domain 
		   let domain = this.extractDomain( url );
		   if( ! domain ) return;   // bail if domain is empty

 			let site = this.mySites[ domain ];
			if( !this.mySites[ domain ] ) {
				site = { total: 0 , frecencySum: 0 , 
				         frecencyMax: 0, daysOverSum: 0, 
				          daysOverLogSum: 0 , dtotal: 0 ,  
						  dOverSum: 0 , dOverLogSum: 0, lsd: 0 };
				this.mySites[ domain ]  = site;
			}
			site.total ++;
			site.daysOverSum += 1.0 / (1 + daysPassed);
			site.daysOverLogSum += 1.0 / (1 + Math.log( 1 + daysPassed));
			site.frecencySum += frecency;

			if( frecency > site.frecencyMax ) {
				site.frecencyMax = frecency;
			}

			if( site.lsd != onDay ) {
				site.lsd = onDay;
				site.dtotal ++;
				site.dOverSum += 1.0 / (1 + daysPassed);
				site.dOverLogSum += 1.0 / (1 + Math.log( 1 + daysPassed));
		    }
       	}.bind( this ) ,

		onCompletion: function ( reason ) {
		var s2 = Date.now();
		console.log("sql exec", s2 - s1);
			this.computeSitesData( );
			console.log("compute", Date.now() - s2);
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
  	//console.log( JSON.stringify( this.mySites ) );
  	for ( domain in this.mySites ) {
		if( domain && this.mySites[ domain ].total > this.totalLimit ) {
			//console.log( domain , JSON.stringify( this.mySites[ domain ] ) );
		    this.processHistorySite( domain );
		}
	}
	//console.log( "CATS " + JSON.stringify( this.cats) );
	//console.log( "DEMOG " + JSON.stringify( this.demog) );
  },

  computeSiteWeight: function( domain ) {
  		
		let data = this.mySites[ domain ];
		if( data ) {
			return this.weighter[ this.currentWeighter ]( data );
		}
		else {
			return 0;
		}
  },

  processHistorySite: function( domain ) {

  	// ok check if site is present 
	let siteData = this.allSites[ domain ];

	if( ! siteData ) return;   // domain is not found

	let vcount = this.computeSiteWeight( domain );


    // otherwise add it to the soup
	if( siteData.cats ) {
	    let addedHash = {};
		siteData.cats.forEach( function ( category ) {
			this.addToCategory( domain , category , vcount , addedHash );
		}.bind( this ));
		this.totalAcross += vcount;
		this.totalSquared += vcount*vcount;
	} else {
		// no categories add to missing sites
		this.misses.addItem( domain , vcount );
    }

	if( siteData.demog ) {
		// so we have demographics data add them to bukets
		for( x in demogBuckets ) {
			let buketName = demogBuckets[x];
			let bucketDrop  = siteData.demog[x];
			//console.log( domain , buketName , bucketDrop );
			this.demog[ buketName ].vtotal += vcount * bucketDrop;
			if( bucketDrop < 0 ) {
				//console.log( domain , vcount , bucketDrop );
				this.demog[ buketName ].neg.addItem( { domain: domain , vcount: vcount , drop: bucketDrop } , (-vcount) * bucketDrop )
			} else {
				this.demog[ buketName ].pos.addItem( { domain: domain , vcount: vcount , drop: bucketDrop } , (vcount) * bucketDrop )
			}
		}
	}

  },

  addToCategory: function( domain , cat , count , addedHash ) {
  	// for now simply take the top ones
	//let top = cat.replace( /\/.*/ , "" );
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
		this.cats[ top ] = { vcount: 0 , tcount: 0 , champs: new ItemJar(15) };
	}
	this.cats[ top ].vcount += count;
	this.cats[ top ].tcount ++;
	this.cats[ top ].champs.addItem( { domain: domain , vcount: count } , count );
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
				let siteFoo = this.allSites[ domain ];
				if( siteFoo == undefined  ) {
					siteFoo = {};
					siteFoo.cats = [];
					this.allSites[ domain ] = siteFoo;
				}
			    //siteFoo.rank = data[1];
				data.forEach( function( item ) {
				    if( item && item != "" && item.indexOf("Regional") != 0 ) {
			    		siteFoo.cats.push( item );
					}
				});

				if( siteFoo.cats.length == 0 ) {
					delete this.allSites[ domain ];
				}

		 }.bind(this));
		 //console.log( JSON.stringify( this.allSites ) );
  },

  readDemographics: function ( ) {
  	let sites = data.load( this.demogFile );
	sites.split( /\n/ ).forEach( function( line ) {
			let data = line.split( /\t/ );
			let domain = data.shift( );
			data.shift( ); // get rid of the ID
			let siteFoo = this.allSites[ domain ];
			if( siteFoo == undefined  ) {
				siteFoo = {};
                this.allSites[ domain ] = siteFoo;
			}
            siteFoo.demog = data;
		}.bind( this ));
  },

  getInterests: function( ) {

  	return this.cats;

  },

  getDemographics: function( ) {

  	return this.demog;

  },

  normalize: function( ) {
  	let dist = this.getTotalDist( );
  	Object.keys( this.cats ).forEach( function ( key ) {
		this.cats[ key ].vcount = this.cats[ key ].vcount / dist ;
	}.bind( this ));
  },

}


exports.Demographer = Demographer;


