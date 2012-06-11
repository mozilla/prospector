/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Keep a reference to unloaders that need to run
const unloaders = [];

/**
 * Run all unloaders and clean up
 */
function runUnloaders() {
  unloaders.slice().forEach(function(unloader) unloader());
  unloaders.length = 0;
}

/**
 * Save callbacks to run when unloading. Optionally scope the callback to a
 * container, e.g., window. Provide a way to run all the callbacks.
 *
 * @usage unload(): Run all callbacks and release them.
 *
 * @usage unload(callback): Add a callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 *
 * @usage unload(callback, container) Add a scoped callback to run on unload.
 * @param [function] callback: 0-parameter function to call on unload.
 * @param [node] container: Remove the callback when this container unloads.
 * @return [function]: A 0-parameter function that undoes adding the callback.
 */
exports.unload = function(callback, container) {
  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    runUnloaders();
    return;
  }

  // Wrap the callback in a function that ignores failures
  let unloader = function() {
    try {
      callback();
    }
    catch(ex) {}
  }

  // Save the unloader and provide a way to remove it
  unloaders.push(unloader);
  let removeUnloader = function() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
	// XXXX who is using this new callback
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  return removeUnloader;
}

// Make sure to run the unloaders when unloading
require("unload").when(runUnloaders);
