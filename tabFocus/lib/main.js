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
 * The Original Code is Tab Focus.
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
const pageMod = require("page-mod");
const {Hotkey} = require("hotkeys");
const {Cc, Cu, Ci, Cm} = require("chrome");
const widgets = require("widget");

let DEBUG = false;
let reportError = DEBUG ? console.log : function() {};

const utils = require("./utils");
const clustering = require("./clustering")

let Svcs = {}
Cu.import("resource://gre/modules/Services.jsm", Svcs);
let Places = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", Places);

function getPlaceInformation(url) {
  let results = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query": "SELECT id, url, title, rev_host FROM moz_places WHERE url = :url",
    "params": {"url" : url},
    "names": ["id", "url", "title"],
  });
  
  if (results.length == 0) {
    return null;
  }

  return results[0];
}

function getVisiblePlaces() {
  let gBrowser = Svcs.Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
  let visibleTabs = gBrowser.visibleTabs;
  let uris = [];
  for (let i = 0; i < visibleTabs.length; i++) {
    let tab = visibleTabs[i];
    if (tab.pinned)
      continue;
    let uri = gBrowser.getBrowserForTab(tab).currentURI.spec;
    let info = getPlaceInformation(uri)
    if (info)
      uris.push(info);
  }
  return uris;
}

function recall() {
  let activeTab = tabs.activeTab;
  let focusSet = clustering.cluster(getVisiblePlaces(), activeTab);
  let currentWindow = Svcs.Services.wm.getMostRecentWindow("navigator:browser");
  let gBrowser = currentWindow.gBrowser;
  let visibleTabs = gBrowser.visibleTabs;
  let moveTabs = [];
  for (let i = 0; i < visibleTabs.length; i++) {
    let tab = visibleTabs[i];
    if (tab.pinned)
      continue;
    let uri = gBrowser.getBrowserForTab(tab).currentURI.spec;

    if (uri in focusSet)
      moveTabs.push(tab);
  }
  
  function initTabs() {
    let newGroup = currentWindow.TabView.getContentWindow().GroupItems.newGroup();
    let newGroupId = newGroup.id;
    moveTabs.forEach(function(moveTab) {
      currentWindow.TabView.moveTabTo(moveTab, newGroupId);
    })
    activeTab.activate()
  }

  if (currentWindow.TabView.getContentWindow() == null) {
    currentWindow.TabView._initFrame(initTabs);
  } else {
    initTabs();
  }
}

tabs.on('activate', function(tab) {
  let uri = tab.url;
  reportError("switch to" + uri);
});


widgets.Widget({
  id: "recall-monkey-launcher",
  label: "Launch Recall Monkey",
  contentURL: self.data.url("img/eye.png"),
  onClick: function() {
    recall();
  }
});


var showHotKey = Hotkey({
  combo: "accel-shift-l",
  onPress: function() {
    recall();
  }
});
