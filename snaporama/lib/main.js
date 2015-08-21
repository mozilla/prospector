/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const self = require("self");
const tabs = require("tabs");
const panel = require("panel");
const ss = require("simple-storage");
const utils = require("./utils");
const pageMod = require("page-mod");
const {Hotkey} = require("hotkeys");
const {Cc, Cu, Ci, Cm} = require("chrome");
const widgets = require("widget");

let DEBUG = false;
let reportError = DEBUG ? console.log : function() {};
let J = JSON.stringify;



let Svcs = {}
Cu.import("resource://gre/modules/Services.jsm", Svcs);
let Places = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", Places);
Places.PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);
let conn = Places.PlacesUtils.history.DBConnection;
let PlacesUI = {};
Cu.import("resource://gre/modules/PlacesUIUtils.jsm", PlacesUI);

let bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
              .getService(Ci.nsINavBookmarksService);
let ios = Cc["@mozilla.org/network/io-service;1"]
            .getService(Ci.nsIIOService);

function getPlaceInformation(url) {
  let results = utils.spinQuery(conn, {
    "query": "SELECT id, url, title, rev_host FROM moz_places WHERE url = :url",
    "params": {"url" : url},
    "names": ["id", "url", "title"],
  });
  
  if (results.length == 0) {
    return null;
  }

  return results[0];
}

let snapPanel = panel.Panel({
  width: 300,
  height: 300,
  contentURL: self.data.url("snap.html"),
  contentScriptFile: self.data.url("js/snap.js"),
  onShow: function() {
    this.postMessage({"folders":getBookmarkFolders()})
  },
  onMessage: function(data) {
    reportError(JSON.stringify(data));
    if (data.snap) {
      let currentWindow = Svcs.Services.wm.getMostRecentWindow("navigator:browser");
      let gBrowser = currentWindow.gBrowser;
      let visibleTabs = gBrowser.visibleTabs;
      let moveTabs = [];
      let uriList = visibleTabs.filter(function(tab) {
        return (!tab.pinned);
      }).map(function (tab) {
        return gBrowser.getBrowserForTab(tab).currentURI;
      });
      PlacesUI.PlacesUIUtils.showMinimalAddMultiBookmarkUI(uriList);
    } else if (data.id) {
      let folderId = data.id;
      reportError('altering ' + folderId);
      bmsvc.removeFolderChildren(folderId);
      let currentWindow = Svcs.Services.wm.getMostRecentWindow("navigator:browser");
      let gBrowser = currentWindow.gBrowser;
      let visibleTabs = gBrowser.visibleTabs;
      let moveTabs = [];
      let uriList = visibleTabs.filter(function(tab) {
        return (!tab.pinned);
      }).map(function (tab) {
        let uri = gBrowser.getBrowserForTab(tab).currentURI;
        let title =  gBrowser.getBrowserForTab(tab).contentDocument.title;
        bmsvc.insertBookmark(folderId, uri, bmsvc.DEFAULT_INDEX, title);
      });
      this.hide();
    }
  }
});

let snap = widgets.Widget({
  id: "widget-snap",
  label : "Snap Panorama",
  contentURL: self.data.url("img/camera.png"),
  panel: snapPanel,
});



function getBookmarkFolders() {
  return utils.spinQuery(conn, {
    "query": "SELECT id,title FROM moz_bookmarks where type=2 AND (parent=2 OR parent=3)",
    "params" : {},
    "names" : ["id", "title"]
  });
}

function getGroupItems(id) {
  return utils.spinQuery(conn, {
    "query" : "SELECT p.url as url from (SELECT * FROM moz_bookmarks where" + 
              " parent = :id) b JOIN moz_places p on p.id=b.fk",
    "params" : {"id" : id},
    "names" : ["url"],
  }).map(function({url}) {
    return url;
  });
}

let galleryPanel = panel.Panel({
  width: 300,
  height: 300,
  contentURL: self.data.url("gallery.html"),
  contentScriptFile: self.data.url("js/gallery.js"),
  onShow: function() {
   this.postMessage({
      "folders" : getBookmarkFolders(),
    });
  },
  onMessage: function(data) {
    let me = this;
    reportError("got message for id" + data.id);
    let urls = getGroupItems(data.id);
    reportError(J(urls));
    let currentWindow = Svcs.Services.wm.getMostRecentWindow("navigator:browser");
    function initTabs() {
      let gI = currentWindow.TabView.getContentWindow().GroupItems;
      let newGroup = gI.newGroup();
      gI.setActiveGroupItem(newGroup);
      urls.forEach(function (url) {
        tabs.open({
          "url" : url,
        });
      });
      me.hide();
    }
    if (currentWindow.TabView.getContentWindow() == null) {
      currentWindow.TabView._initFrame(initTabs);
    } else {
      initTabs();
    }
  },
});
let gallery = widgets.Widget({
  id:  "widget-gallery",
  label: "Snapshot Gallery",
  contentURL: self.data.url("img/gallery.png"),
  panel: galleryPanel,
});


