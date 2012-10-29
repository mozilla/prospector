/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Ci,Cu,Cc} = require("chrome");
const {data} = require("self");
const timers = require("timers");
const historyUtils = require("HistoryUtils");

Cu.import("resource://gre/modules/Services.jsm", this);

const ONE_WEEK_MILLI_SECONDS = 604800000;

function Demographer(sitesCatFile) {
  this.catFile = sitesCatFile;

  this.totalVisits = 0;
  this.catDepth = 2;

  this.mySites = {};
  this.allSites = null;
  this.cats = null;
  this.orderedCats = null;
  this.totalSum = 0;

  // collect seconds since the epoch beings
  this.lastReading = Date.now();

  // set up observer to fire daily when user is idle
  // and rebuild interests every week
  let onceDailyObserver = function(doc, topic, data) {
    let differenceSeconds = Date.now() - this.lastReading;
    if (differenceSeconds > ONE_WEEK_MILLI_SECONDS) {
      this.rebuild();
      this.lastReading = Date.now();
    }
  }.bind(this);

  Services.obs.addObserver(onceDailyObserver, "idle-daily", false);
}

Demographer.prototype = {
  rebuild: function(cb) {
    this.totalVisits = 0;
    this.cats = {};
    this.mySites = {};
    this.orderedCats = [];
    this.totalSum = 0;
    // check if we loaded sites<->ODP mapping
    if (this.allSites == null) {
      this.allSites = {};
      this.readSiteToCategoryMapping( );
    }
    this.readHistory(cb);
  },

  extractDomain: function(domain) {
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

  readHistory: function(cb) {
    let query = "select SUM(visit_count), rev_host from moz_places where visit_count >= 1 group by rev_host";
    historyUtils.executeHistoryQuery(query, null, {
      onRow: function(row) {
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
      }.bind(this),

      onCompletion: function(reason) {
        this.computeSitesData();
          if (cb) {
            cb();  // execute call back
          }
        }.bind(this),

      onError: function(error) {
        console.log(error);
      }.bind(this),
    });
  },

  computeSitesData: function() {
    for (let domain in this.mySites) {
      this.processHistorySite(domain);
    }
    this.normalize();
    this.sortirize();
  },

  processHistorySite: function(domain) {
    // ok check if site is present
    let siteData = this.allSites[domain];
    let vcount = this.mySites[domain];

    // domain is not found
    if (!siteData || !vcount || vcount == 0) {
      return;
    }

    vcount = Math.log(vcount);  // log the count

    // add it to the soup
    if (siteData.cats) {
      let addedHash = {};
      siteData.cats.forEach(function(category) {
        this.addToCategory(domain, category, vcount, addedHash);
      }.bind(this));
      this.totalVisits += vcount;
    }
  },

  addToCategory: function(domain, cat, count, addedHash) {
    // for now simply take the top ones
    let them = cat.split("/");
    let top = them.shift();
    let depth = 1;
    while (them.length && depth < this.catDepth) {
      top += "/" + them.shift();
      depth++;
    }

    // check if we saw this category already
    if (addedHash[top]) {
      return;
    }

    addedHash[top] = 1;
    if (!this.cats[top]) {
      this.cats[top] = 0;
    }
    this.cats[top] += count;
  },

  readSiteToCategoryMapping: function() {
    // read the file first
    let sites = data.load(this.catFile);
    // split by new lines
    sites.split(/\n/).forEach(function(line) {
      // figure site, rank and cat
      let data = line.split(/ /);
      let domain = data.shift();
      // empty domain
      if (domain == "") {
        return;
      }

      let site = this.allSites[domain];
      if (site == undefined) {
        site = {};
        site.cats = [];
        this.allSites[domain] = site;
      }

      data.forEach(function(item) {
        if (item && item != "" && item.indexOf("Regional") != 0) {
          site.cats.push(item);
        }
      });

      if (site.cats.length == 0) {
        delete this.allSites[domain];
      }
    }.bind(this));
  },

  submitInterests: function(callback) {
    let callbackLoader = function() {
      callback(this.cats);
    }.bind(this);

    if (this.cats == null) {
      this.rebuild(callbackLoader);
    }
    else {
      // be explicitly asynchronous - call callback via timeout
      timers.setTimeout(callbackLoader);
    }
  },

  normalize: function() {
    Object.keys(this.cats).forEach(function(key) {
      this.cats[key] = this.cats[key] * 100.0 / this.totalVisits ;
      if (this.cats[key] < 0.001) {
        delete this.cats[key];
      }
    }.bind(this));
  },

  sortirize: function() {
    Object.keys(this.cats).forEach(function(key) {
       let value = Math.ceil(this.cats[key]);
       this.totalSum += value;
       for( var i = 0; i< value; i ++) {
         this.orderedCats.push(key);
       }
    }.bind(this));
  },

  pickRandomBest: function(cb) {
     if(this.orderedCats == null) {
        this.submitInterests(function(cats) {
          let index = Math.round(Math.random()*this.totalSum);
          cb(this.orderedCats[index]);
        }.bind(this));
     }
     else {
        timers.setTimeout(function() {
          let index = Math.round(Math.random()*this.totalSum);
          cb(this.orderedCats[index]);
        }.bind(this));
     }
  },
  
}

exports.Demographer = Demographer;
