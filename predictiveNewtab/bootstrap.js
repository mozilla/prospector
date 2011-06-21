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
 * The Original Code is Predictive Newtab.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Abhinav Sharma <asharma@mozilla.com>
 *   Edward Lee <edilee@mozilla.com>
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
