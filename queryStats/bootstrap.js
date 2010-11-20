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
 * The Original Code is Query Stats.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *   Erik Vold <erikvvold@gmail.com>
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

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/DownloadUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

/**
 * Analyze form history with web history and output results
 */
function analyze(doc, maxCount, maxRepeat, maxDepth, maxBreadth) {
  // Show a page visit with an icon and linkify
  function addEntry(container, url, text, extra) {
    let div = container.appendChild(doc.createElement("div"));
    let a = div.appendChild(doc.createElement("a"));
    a.href = url;
    let img = a.appendChild(doc.createElement("img"));
    img.style.height = "16px";
    img.style.paddingRight = "4px";
    img.style.width = "16px";
    img.src = Svc.Favicon.getFaviconImageForPage(Utils.makeURI(url)).spec;
    a.appendChild(doc.createTextNode(text));
    div.appendChild(doc.createTextNode(extra || ""));
    return div;
  }

  // Recursively follow link clicks to some depth
  function addLinks(container, visitId, depth, numObj) {
    if (depth > maxDepth)
      return;

    // Initialze a number object pass by reference
    if (numObj == null)
      numObj = {val: 0};

    // Find pages from the current visit
    let stm = Utils.createStatement(Svc.History.DBConnection,
      "SELECT *, v.id as nextVisit " +
      "FROM moz_historyvisits v " +
      "JOIN moz_places h ON h.id = v.place_id " +
      "WHERE v.from_visit = :visitId " +
      "LIMIT :breadth");
    stm.params.visitId = visitId;
    stm.params.breadth = maxBreadth;
    Utils.queryAsync(stm, ["url", "title", "nextVisit"]).forEach(function({url, title, nextVisit}) {
      // Follow the redirect to find a page with a title
      if (title == null) {
        addLinks(container, nextVisit, depth, numObj);
        return;
      }

      let count = "";
      if (++numObj.val > 1)
        count = " (click " + numObj.val+ ")";

      // Add the result that we found then add its links
      let resultDiv = addEntry(container, url, title, count);
      resultDiv.style.marginLeft = "2em";
      addLinks(resultDiv, nextVisit, depth + 1);
    });
  }

  let results = doc.getElementById("results");
  results.innerHTML = "";

  // Get the last most recently used form history items
  let stm = Utils.createStatement(Svc.Form.DBConnection,
    "SELECT * " +
    "FROM moz_formhistory " +
    "ORDER BY lastUsed DESC " +
    "LIMIT :count");
  stm.params.count = maxCount;
  Utils.queryAsync(stm, ["value", "fieldname"]).forEach(function({value, fieldname}) {
    let queries = 0;
    let queryField = fieldname == "searchbar-history" ? "" : fieldname.slice(-7);
    let queryVal = value.replace(/ /g, "+");

    // Find the pages that used those form history queries
    let stm = Utils.createStatement(Svc.History.QueryInterface(Ci.nsPIPlacesDatabase).DBConnection,
      "SELECT *, v.id as startVisit " +
      "FROM moz_places h " +
      "JOIN moz_historyvisits v ON v.place_id = h.id " +
      "WHERE url LIKE :query AND visit_type = 1 " +
      "ORDER BY visit_date DESC " +
      "LIMIT :repeat");
    stm.params.query = "%" + queryField + "=" + queryVal + "%";
    stm.params.repeat = maxRepeat;
    Utils.queryAsync(stm, ["url", "title", "startVisit", "visit_date"]).forEach(function({url, title, startVisit, visit_date}) {
      let host = Utils.makeURI(url).host.replace(/www\./, "");
      let timeDiff = Date.now() - visit_date / 1000;
      let ago = DownloadUtils.convertTimeUnits(timeDiff / 1000).join(" ");

      let count = "";
      if (++queries > 1)
        count = "(repeat " + queries + ")";

      // Add an entry for this search query and its related clicks
      let searchDiv = addEntry(results, url, value, [" @", host, ago, "ago", count].join(" "));
      addLinks(searchDiv, startVisit, 1);
    });
  });
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data, reason) AddonManager.getAddonByID(data.id, function(addon) {
  Cu.import("resource://services-sync/util.js");
  let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;

  // In the edge case where gBrowser is null just disable
  if (!gBrowser)
    return addon.userDisabled = true;

  // Open a tab with chrome privileges to replace the content
  let tab = gBrowser.selectedTab = gBrowser.addTab("chrome://browser/content/aboutHome.xhtml");
  tab.linkedBrowser.addEventListener("load", function() {
    tab.linkedBrowser.removeEventListener("load", arguments.callee, true);
    // overwrite onLoad function in chrome://browser/content/aboutHome.js
    tab.linkedBrowser.contentWindow.onLoad = function(){};

    let doc = tab.linkedBrowser.contentDocument;
    doc.body.innerHTML = '<style>span { display: inline-block; width: 7em; } input:not(#go) { width: 2em; }</style>' +
      '<a href="https://mozillalabs.com/prospector/2010/11/19/analyze-your-search-behavior/">Check Mozilla Labs "Analyze Your Search Behavior" for more information</a><br/>' +
      '<em>(This add-on deactivates itself after running once; use the <a href="about:addons">Add-ons Manager</a> to reactivate.)</em><br/>' +
      '<form id="form">' +
      '<span>Query Count:</span><input id="count" value="20"/> Number of search queries to look through<br/>' +
      '<span>Query Repeat:</span><input id="repeat" value="5"/> Number of repeat searches of each search query<br/>' +
      '<span>Link Depth:</span><input id="depth" value="4"/> Follow link clicks through how many pages?<br/>' +
      '<span>Link Breadth:</span><input id="breadth" value="10"/> Follow how many clicks from the same page?<br/>' +
      '<input id="go" type="submit" value="Analyze Search Queries!"/>' +
      '</form>' +
      '<div id="results"></div>';

    function $(id) parseInt(doc.getElementById(id).value) || 0;
    let go = doc.getElementById("go");

    // Fetch the form fields and visibly disable the form when analyzing
    function doAnalyze() {
      go.disabled = true;
      analyze(doc, $("count"), $("repeat"), $("depth"), $("breadth"));
      go.disabled = false;
    }

    // Analyze on enter/click and immediately
    doc.getElementById("form").addEventListener("submit", function(event) {
      event.preventDefault();
      doAnalyze();
    }, false);
    doAnalyze();
  }, true);

  // Disable after running
  addon.userDisabled = true;
});

function shutdown() {}
function install() {}
function uninstall() {}
