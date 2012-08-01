/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const file = require("file");
const timers = require("timers");
const {data} = require("self");
const passwords = require("passwords");

const {Cc,Ci,Cm,Cr,Cu,components} = require("chrome");

Cm.QueryInterface(Ci.nsIComponentRegistrar);

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

function Demographer( sitesCatFile , sitesDemogFile  ) {
  this.ready = false;
  this.waitingReady = [];

    this.catFile = sitesCatFile;
    this.demogFile = sitesDemogFile;
    this.allSites = {};
    this.mySites = {};
	this.cats = {};
	this.demog = { };
	for ( x in demogBuckets ) {
		this.demog[ demogBuckets[x] ] = { vtotal: 0 , neg: new ItemJar(5) , pos: new ItemJar(5) };
	}

	this.catDepth = 2;
	this.totalAcross = 0;

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
	this.totalAcross = 0;
  },

  rebuild: function ( cb ) {
    this.ready = false;
  	this.clearCats( );
	this.mySites = {};
	this.readHistory( cb );
	//this.computeSitesData( );
  },

  getTotalAcross: function( ) { return this.totalAcross; } ,

  extractDomain: function ( domain ) {
    // and make sure to get rid of www
    let re = /^www[.]/;
    domain = domain.replace(re, "");

    // ok check if site is present in our global site list
    let siteData = this.allSites[domain];

    // attempt to go to the root domain, keep the lastDomain
    // so that we never ran into endless loop if regex does not replace
    // anything.  Hence, regex failes on strings starting with '.'
    let lastDomain = domain;
    while (!siteData) {
      domain = domain.replace(/^[^.]+[.]/, "");
      if (domain == lastDomain || domain.length <= 1 || domain.indexOf(".") < 0) {
        domain = null;
        // no need to go further
        break;
      }
      siteData = this.allSites[domain];
    }

    return siteData ? domain : null;
  },

  readHistory: function ( cb ) {

    let query = "select SUM(visit_count), rev_host from moz_places where visit_count >= 1 group by rev_host";
	var s1 = Date.now();
    historyUtils.executeHistoryQuery( query , null , 
	   {
	     onRow: function ( row ) {
          let vcount = row.getResultByIndex(0);
          let rev_host = row.getResultByIndex(1);
          let host = rev_host.split("").reverse().join("");

          // if host is preceeded with '.', remove it
          if (host.charAt(0) == '.') {
            host = host.slice(1);
          }

          // now we need to grep the domain
          let domain = this.extractDomain(host);
          // bail if domain is empty
          if (!domain) {
            return;
          }

          let site = this.mySites[domain];
          if (!this.mySites[domain]) {
            this.mySites[domain] = 0;
          }
          this.mySites[domain] += vcount;

       	}.bind( this ) ,

		onCompletion: function ( reason ) {
		var s2 = Date.now();
		console.log("sql exec", s2 - s1);
			this.computeSitesData( );
			console.log("compute", Date.now() - s2);
			if( cb ) {
				cb( );  // execute call back
			}

                  this.ready = true;
                  this.waitingReady.slice().forEach(function(cb) {
                    try {
                      cb();
                    }
                    catch(ex) {}
                  });
                  this.waitingReady.length = 0;
		}.bind( this ) ,

		onError: function ( error ) {
			console.log( error );
		}.bind( this ) ,
	 });
  },

  computeSitesData: function( ) {
  	for ( let domain in this.mySites ) {
		if( domain ) {
		    this.processHistorySite( domain );
		}
	}
  },

  computeSiteWeight: function( domain ) {
  		
		let vcount = this.mySites[ domain ];
		if( vcount ) {
			return Math.log(vcount);
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
	}

	if( siteData.demog ) {
		// so we have demographics data add them to bukets
		for( x in demogBuckets ) {
			let buketName = demogBuckets[x];
			let bucketDrop  = siteData.demog[x];
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

  // Allow consumers to wait until data is computed
  onReady: function(cb) {
    if (this.ready) {
      timers.setTimeout(function() cb());
    }
    else {
      this.waitingReady.push(cb);
    }
  },
}


exports.Demographer = Demographer;


