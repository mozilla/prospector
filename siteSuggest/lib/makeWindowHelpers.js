/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {listen} = require("listen");
const {unload} = require("unload+");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

exports.makeWindowHelpers = function(window) {
  let {document} = window;

  // Replace a value with another value or a function of the original value
  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }

  // Create a XUL node
  function createNode(nodeName) {
    return document.createElementNS(XUL_NS, nodeName);
  }

  return {
    change: change,
    createNode: createNode,
    listen: function(n, e, f, c) listen(window, n, e, f, c),
    unload: function(f) unload(f, window),
  };
};
