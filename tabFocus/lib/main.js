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
