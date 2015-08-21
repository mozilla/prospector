/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* alias for quick access */
const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

/* imports */
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

/* Javascript files to import from scripts/ */
AWESOMETAB_SCRIPTS = [
  "utils",
  "awesometab",
  "thumbnail",
  "helpers",
  "collector",
  "grandcentral",
  "allsearch",
  "stop",
  "bmsearch",
  "pos",
  "mixer",
  "display",
  "jump",
];

const global = this;
const DEBUG = false;
const SHOWNICE = false;
const TESTER = true;
const reportError = DEBUG ? Cu.reportError : function() {};
const J = DEBUG ? JSON.stringify : function() {return ""};


/* some useful regular expressions */
RE_NOUN_VERB = new RegExp(/(^NN)|(^VB)|(^JJ)/);

/*http{s}://<anything goes here>{/} types of URLs are good */
RE_HOME_URL = new RegExp(/^https{0,1}:\/\/[a-zA-Z0-9\.\-\_]+\/{0,1}$/);

/*
 * 1. has an unacceptable substring like /post/ or /article/
 * 2. ends with a number like bla.com/2/ or bla.com/2
 * 3. has 8 or more consecutive numbers, ignoring slashes
 */
RE_FAIL_URL = new RegExp(/(\/post\/|\/article\/)|([\/#][0-9]+\/{0,1}$)|((\/*[0-9]){8,})/)


function handlePageLoad(e) {
  //reportError("Handling a page load");
  // global.thumbnailer.handlePageLoad(e);
  /*
  try {
  let doc = e.originalTarget;
  let win = doc.defaultView;
  let url = doc.location.href;
  global.jumper.addPageLoad(url);
  } catch (ex) { reportError(ex) }
  */
}

function handleTabSelect(e) {
  let url = e.originalTarget.linkedBrowser.contentDocument.location.href;
  if (url && (/^http:\/\//).test(url)) {
    reportError("TAB CHANGE: " + url + global.useActiveTab);
    useActive = true;
    global.lastURL = url;
    global.jumper.addTabChange(url);
  }
}

/**
 * Shift the window's main browser content down and right a bit
 */
function setupListener(window) {

  window.addEventListener("DOMContentLoaded", handlePageLoad, true);
  let gB = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
  //gB.tabContainer.addEventListener("TabSelect", handleTabSelect, false)
  listen(window, gB.tabContainer, "TabSelect", handleTabSelect);

  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }

  change(window.gBrowser, "loadOneTab", function(orig) {
    return function(url) {
      let tab = orig.apply(this, arguments);
      if (url == "about:blank") {
        let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
        let fileURI = global.aboutURI.resolve('');
        let tBrowser = gBrowser.getBrowserForTab(tab)
        tBrowser.loadURI(fileURI, null, null);

        tab.linkedBrowser.addEventListener("load", function() {
          tab.linkedBrowser.removeEventListener("load", arguments.callee, true);
          Services.wm.getMostRecentWindow("navigator:browser").gURLBar.value = "";
          let doc = tab.linkedBrowser.contentDocument;
          let dashboard = new AwesomeTab(doc, global.utils, global.central, global.tagger, 0) //global.thumbnailer.getAnnoID());
        }, true);

      }
      return tab;
    };
  });

  unload(function() {
    window.removeEventListener("DOMContentLoaded", handlePageLoad, true);
    //gB.tabContainer.removeEventListener("TabSelect", handleTabSelect, true);
  }, window);
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  // XXX Force a QI until bug 609139 is fixed
  Cu.import("resource://services-sync/util.js");
  PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

  /* import scripts */
  AWESOMETAB_SCRIPTS.forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });
  global.aboutURI = !SHOWNICE ? addon.getResourceURI("content/awesometab.html") : addon.getResourceURI("content/dial.html");
  global.central = new SiteCentral();
  global.jumper = new JumpTracker();
  /*
  global.linkJumper = new LinkJumper();
  */
  useActive = false;

  global.tagger = new POSTagger();
  global.utils = new AwesomeTabUtils();

  let dbName = "moz_jump_tracker";
  let schema = "id INTEGER PRIMARY KEY AUTOINCREMENT," +
               "src LONGVARCHAR," + 
               "dst LONGVARCHAR," +
               "count INTEGER," +
               "type INTEGER";
  try {
    global.utils.createDB(dbName, schema);
  } catch (ex) {
    reportError(J(ex));
    // do nothing, the db already exists
  }
  // global.thumbnailer = global.thumbnailer ? global.thumbnaler : new Thumbnailer();
  watchWindows(setupListener);
});

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {}
