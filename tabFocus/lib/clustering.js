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

const {Cc, Cu, Ci, Cm} = require("chrome");
const utils = require("./utils");
let Svcs = {}
Cu.import("resource://gre/modules/Services.jsm", Svcs);
let Places = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", Places);

let DEBUG = false;
let reportError = DEBUG ? console.log : function() {};

let J = JSON.stringify;


HID_PARENT_MEMO = {};
function getHIDParent(hid) {
  if (hid in HID_PARENT_MEMO) {
    return HID_PARENT_MEMO[hid];
  }
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT from_visit FROM moz_historyvisits WHERE id = :hid AND from_visit IS NOT NULL",
    "params": {"hid" : hid},
    "names": ["from_visit"],
  });
  if (result.length == 0) {
    return 0;
  }
  let p = result[0]["from_visit"];
  HID_PARENT_MEMO[hid] = p;
  return p;
}


function getHIDChildren(hid) {
  return utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT id FROM moz_historyvisits WHERE from_visit = :hid",
    "params" : {"hid" : hid},
    "names" : ["id"],
  }).map(function({id}) {
    return id;
  });
}

function createTreeFromRoot(hid) {
  let placeId = getPIDFromHID(hid);
  let url = getURLFromPID(placeId);
  let node = {
    "hid" : hid,
    "placeId" : placeId,
    "url" : url,
    "children" : [],
  };
  let children = getHIDChildren(hid);
  if (!children || children.length == 0) {
    return node;
  }
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    node.children.push(createTreeFromRoot(child));
  }
  return node;
}

function getPIDFromHID(hid) {
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT place_id FROM moz_historyvisits WHERE id = :hid",
    "params" : {"hid" : hid},
    "names" : ["place_id"],
  });
  if (result.length == 0) {
    return 0;
  }
  return result[0].place_id;
}


function getURLFromPID(placeId) {
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT url FROM moz_places WHERE id = :placeId",
    "params" : {"placeId" : placeId},
    "names" : ["url"],
  });
  if (result.length == 0) {
    return "";
  }
  return result[0].url;
}

function createHIDTree(hid) {
  if (hid == 0) {
    return {};
  }
  let current = hid;
  while (true) {
    current = getHIDParent(hid);
    if (current == 0) {
      break;
    } else {
      hid = current;
    }
  }
  let tree = createTreeFromRoot(hid);
  tree.all = getAllPlacesInTree(tree);
  return tree;
}

function getAllPlacesInTree (root) {
  let set = {};
  function helper(node) {
    set[node.placeId] = true;
    for (let i = 0; i < node.children.length; i++) {
      let child = node.children[i];
      helper(child);
    }
  }
  helper(root);
  return set;
}

function printHIDTree(root, tab) {
  reportError(tab + root.url);
  for (let i = 0; i < root.children.length; i++) {
    let child = root.children[i];
    printHIDTree(child, tab + "  ");
  }
}

function getPIDFromURL(url) {
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT id FROM moz_places WHERE url = :url",
    "params"  : {"url" : url},
    "names" : ["id"],
  });
  if (result.length == 0) {
    return 0;
  }
  return result[0]["id"];
}

function getLatestKHID(placeId, k) {
  let result = utils.spinQuery(Places.PlacesUtils.history.DBConnection, {
    "query" : "SELECT id FROM moz_historyvisits WHERE place_id = :placeId ORDER BY id DESC LIMIT :k",
    "params" : {
      "placeId" : placeId,
      "k" : k,
    },
    "names" : ["id"],
  });
  if (result.length == 0) {
    return [];
  }
  return result.map(function ({id}) {return id;});
}

function cluster(places, activeTab) {
  reportError("active tab is " + activeTab.url);
  reportError("clustering"  + J(places));

  function getIntScore(allInTree, PIDS) {
    let count = 0;
    PIDS.forEach(function (pid) {
      if (pid in allInTree) {
        count++;
      }
    });
    return count;
  }

  let canonical = {};
  let doneCanonicals = [];
  let activeAll = {};
  let activePID = getPIDFromURL(activeTab.url);
  let probableHIDS = getLatestKHID(activePID, 3);
  let maxIntScore = 0;
  let bestTree = {};
  reportError(J(probableHIDS));
  probableHIDS.forEach(function(pHID) {
    let pTree = createHIDTree(pHID);
    reportError(J(pTree));
    let intScore = getIntScore(pTree.all, places.map(function(place){ return place.id; }));
    if (intScore > maxIntScore) {
      reportError(intScore);
      maxIntScore = intScore;
      bestTree = pTree;
    }
  });
  reportError(J(bestTree));

  let clustered = {
    0: [],
    1: [],
  };
  let focusSet = {};
  for(let i = 0; i < places.length; i++) {
    let place = places[i];
    if (place.id in bestTree.all) {
      clustered[0].push(place);
      focusSet[place.url] = 1;
    } else {
      clustered[1].push(place);
    }
  }
  reportError(J(clustered));
  return focusSet;
}

exports.cluster = cluster;
