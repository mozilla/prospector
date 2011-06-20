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



SCRIPTS = [
  "utils",
  "helpers",
  "dashboard",
  "search",
];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const global = this;
const DEBUG = false;
const reportError = DEBUG ? Cu.reportError : function() {};
const J = DEBUG ? JSON.stringify : function() {};
const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const keysetID = "koala-keyset";
const keyID = "K:Koala";
const fileMenuitemID = "menu_FileKoalaItem";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");


var XUL_APP = {
  name: Services.appinfo.name,
  baseKeyset: "mainKeyset"
};


function addMenuItem(win) {
  var $ = function(id) win.document.getElementById(id);
  var xul = function(type) win.document.createElementNS(NS_XUL, type);
  function removeMI() {
    var menuitem = $(fileMenuitemID);
    menuitem && menuitem.parentNode.removeChild(menuitem);
  }
  removeMI();

  // add the new menuitem to File menu
  let (koalaMI = win.document.createElementNS(NS_XUL, "menuitem")) {
    koalaMI.setAttribute("id", fileMenuitemID);
    koalaMI.setAttribute("class", "menuitem-iconic");
    koalaMI.setAttribute("label", "Recall Monkey");
    koalaMI.setAttribute("accesskey", "M");
    koalaMI.setAttribute("key", keyID);
    koalaMI.addEventListener("command", dashboard, true);

    $("menu_FilePopup").insertBefore(koalaMI, $("menu_FileQuitItem"));
  }

  let koalaKeyset = xul("keyset");
  koalaKeyset.setAttribute("id", keysetID);
  let (koalaKey = xul("key")) {
    koalaKey.setAttribute("id", keyID);
    koalaKey.setAttribute("key", "M");
    koalaKey.setAttribute("modifiers", "accel,alt");
    koalaKey.setAttribute("oncommand", "void(0);");
    koalaKey.addEventListener("command", dashboard, true);
    $(XUL_APP.baseKeyset).parentNode.appendChild(koalaKeyset).appendChild(koalaKey);
  };

  function removeAll() {
    removeMI();
    koalaKeyset.parentNode.removeChild(koalaKeyset);
  }


  unload(removeAll, win);
}



function dashboard() {
  let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
  AddonManager.getAddonByID(global.APP_ID, function(addon) {
    let fileURI = addon.getResourceURI("content/dashboard.html");
    let tab = gBrowser.selectedTab = gBrowser.addTab(fileURI.spec);
    tab.linkedBrowser.addEventListener("load", function() {
      tab.linkedBrowser.removeEventListener("load", arguments.callee, true);
      let doc = tab.linkedBrowser.contentDocument;
      try {
      let dashboard = new Dashboard(doc);
      } catch (ex) { reportError(ex) }
    }, true);
  });
}

function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  // XXX Force a QI until bug 609139 is fixed
  Cu.import("resource://services-sync/util.js");
  PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

  /* import scripts */
  SCRIPTS.forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });
  global.APP_ID = id;
  global.utils = new Utils();
  watchWindows(addMenuItem);
});


function shutdown(data, reason) {
  if (reason != APP_SHUTDOWN)
    unload();
}
function install(data, reason) {}
function uninstall(data, reason) {}
