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
 * The Original Code is Recall Monkey.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Abhinav Sharma <me@abhinavsharma.me> / abhinav on irc.mozilla.org
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
const self         = require("self");
const tabs         = require("tabs");
const ss           = require("simple-storage");
const pageMod      = require("page-mod");
const unload       = require("unload");
const searcher     = require("search");
const {Hotkey}     = require("hotkeys");
const utils        = require("./utils");
const widgets      = require("widget");
const {Cu, Cc, Ci} = require("chrome");

var Places = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", Places);
Places.PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

let J = JSON.stringify;

let Svc = {};
Cu.import("resource://gre/modules/Services.jsm", Svc);

/* add a keyword bookmark for quick access */
function addBookmark() {
  let bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
              .getService(Ci.nsINavBookmarksService);
  let ios = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService);
  let bid = bmsvc.insertBookmark(bmsvc.unfiledBookmarksFolder, 
    ios.newURI(self.data.url("dashboard.html?s=%s"), null, null),
    bmsvc.DEFAULT_INDEX,
    "RecallMonkey Search"
    );
  bmsvc.setKeywordForBookmark(bid, "r");
  ss.storage.bookmarkId = bid;
}

/* create a keyword bookmark for quick access */
if(!ss.storage.isBookmarked) {
  addBookmark();
  ss.storage.isBookmarked = true;
}

/* tags have a particular parent in the bookmark table, get it and save it */
function setRowID() {
  let me = this;
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT rowid FROM moz_bookmarks_roots WHERE root_name = 'tags';",
    "params" : {},
    "names" : ["rowid"],
  });
  if (result.length == 0)
    throw "error: parent id for tags not found in moz_bookmarks_roots";

  ss.storage.rowid = result[0]["rowid"];
}

/* */
if (!ss.storage.rowid) {
  setRowID();
}

/* open up a recallMonkey tab */
function recall() {
  tabs.open({
    "url" : self.data.url("dashboard.html"),
  });
}

/* attach addon bar icon */
widgets.Widget({
  id: "recall-monkey-launcher",
  label: "Launch Recall Monkey",
  contentURL: self.data.url("img/monkey.png"),
  onClick: function() {
    recall();
  }
});

let sr = new searcher.search();

/* attach a worker that listens to the content script for messages */
let mod = pageMod.PageMod({
  include: self.data.url("*"),
  contentScriptFile: self.data.url("monkey.js"),
  onAttach: function attached(worker) {
    worker.on("message", function(data) {
      /* recieved a search request, the worker does the postMessage return */
      if (data.action == "search") {
        sr.search(data.params.query, data.params, data,  worker);
      }
    });
  }
});

/* attach keyboard shortcut for RecallMonkey */
var showHotKey = Hotkey({
  combo: "accel-shift-m",
  onPress: function() {
    recall();
  }
});


function handleUnload(reason) {
  console.log(reason);
  let bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
              .getService(Ci.nsINavBookmarksService);
  let ios = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService);
  let bid = ss.storage.bookmarkId;
  bmsvc.removeItem(bid);
}
unload.when(handleUnload);
