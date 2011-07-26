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
 * The Original Code is Snaporama.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Abhinav Sharma <me@abhinavsharma.me>
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


