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

const Cu = Components.utils;
Cu.import("resource://gre/modules/AddonManager.jsm");

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data) AddonManager.getAddonByID(data.id, function(addon) {
  Cu.import("resource://services-sync/util.js");

  // Fetch the value and usage count of searchbar entries
  let query = "SELECT * FROM moz_formhistory " +
              "WHERE fieldname = 'searchbar-history' " +
              "ORDER BY timesUsed DESC, lastUsed DESC";
  let cols = ["value", "timesUsed"];
  let stmt = Utils.createStatement(Svc.Form.DBConnection, query);
  let entries = Utils.queryAsync(stmt, cols);

  // Create a mapping of each word used to the query string value
  let words = {};
  entries.forEach(function(entry) {
    entry.value.split(/\s+/).forEach(function(word) {
      // Avoid special js keywords (e.g., __proto__) by using a different key
      let key = "w" + word;
      if (words[key] == null)
        words[key] = [entry];
      else
        words[key].push(entry);
    });
  });

  // Count the distinct entries for a given word
  function countDistinct(key) {
    return words[key].length;
  }

  // Sum up the number of times a word is used across multiple form entries
  function countUsed(key) {
    return words[key].reduce(function(prev, entry) {
      return prev + entry.timesUsed - 1;
    }, 0);
  }

  // Display some data sorted by some scoring mechanism
  function output(document, title, score, rows, examples) {
    let table = document.createElement("table");
    let tr = document.createElement("tr");
    let th = document.createElement("th");
    th.setAttribute("colspan", 2);
    th.textContent = title;
    tr.appendChild(th);
    table.appendChild(tr);

    // Sort the words by the scoring and pick the first several
    Object.keys(words).sort(function(a, b) {
      return score(b) - score(a);
    }).slice(0, rows).forEach(function(key) {
      let tr = document.createElement("tr");
      let th = document.createElement("th");
      th.textContent = key.slice(1);
      tr.appendChild(th);

      let td = document.createElement("td");
      let entries = words[key].slice(0, examples);
      td.textContent = entries.map(function(entry) entry.value).join(", ");
      tr.appendChild(td);
      table.appendChild(tr);
    });
    document.body.appendChild(table);
  }

  // Open up a new tab for showing data
  Cu.import("resource://gre/modules/Services.jsm");
  let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
  let tab = gBrowser.selectedTab = gBrowser.addTab();
  let browser = tab.linkedBrowser;
  browser.addEventListener("DOMContentLoaded", function() {
    browser.removeEventListener("DOMContentLoaded", arguments.callee, false);

    let document = browser.contentWindow.document;
    document.title = addon.name;
    output(document, "Unique search queries", countDistinct, 10, 5);
    output(document, "Repeated search queries", countUsed, 10, 5);

    // We're done so uninstall ourself!
    addon.uninstall();
  }, false);
});
