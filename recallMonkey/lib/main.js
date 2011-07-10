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

const self = require("self");
const tabs = require("tabs");
const pageMod = require("page-mod");
const searcher = require("search");
const helpers = require("helpers");
const {Hotkey} = require("hotkeys");
const {Cc, Cu, Ci, Cm} = require("chrome");
const widgets = require("widget");


function recall() {
  let tab = tabs.open({
    "url" : self.data.url("dashboard.html"),
    "title" : "Recall",
    "favicon" : self.data.url("monkey.png"),
  });
}

widgets.Widget({
  id: "recall-monkey-launcher",
  label: "Launch Recall Monkey",
  contentURL: self.data.url("img/monkey.png"),
  onClick: function() {
    recall();
  }
});

let sr = new searcher.search();

let mod = pageMod.PageMod({
  include: "resource://recallmonkey-at-prospector-dot-labs-dot-mozilla-recallmonkey-data/*",
  contentScriptFile: self.data.url("monkey.js"),
  onAttach: function attached(worker) {
    worker.postMessage("message from chrome into content");
    worker.on("message", function(data) {
      if (data.action == "search") {
        let results = sr.search(data.params.query, data.params);
        worker.postMessage({
          "action" : "display",
          "results": results,
          "random" : data.random,
          "append" : data.append,
        })
      }
    });
  }
});

var showHotKey = Hotkey({
  combo: "accel-shift-m",
  onPress: function() {
    recall();
  }
});
//let tab = tabs.open(self.data.url("dashboard.html"));
