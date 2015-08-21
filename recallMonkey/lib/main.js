/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
