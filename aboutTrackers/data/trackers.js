/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Allow clearing all custom settings then redo the page
document.getElementById("reset").addEventListener("click", function() {
  self.port.emit("reset");
  document.location.reload();
});

// Indicate if only cookied sites should be auto-blocked
self.port.on("show_blockCookied", function(blockCookied) {
  let check = document.getElementById("blockCookied");
  check.checked = blockCookied;

  // Allow switching on and off from related nodes
  check.parentNode.addEventListener("click", function({target}) {
    check.checked = !check.checked;
    self.port.emit("set_blockCookied", check.checked);
  });
});

// Fill in the threshold and add functionality
self.port.on("show_threshold", function(threshold) {
  let span = document.getElementById("threshold");
  span.textContent = threshold;

  // Update the threshold on clicks and save the value
  [["minus", -1], ["plus", 1]].forEach(function([id, delta]) {
    let button = document.getElementById("threshold-" + id);
    button.addEventListener("click", function() {
      threshold += delta;
      span.textContent = threshold;
      self.port.emit("set_threshold", threshold);
    });
  });
});

// Build a table with the trackers and blocked status
self.port.on("show_trackers", function(trackers, blocked, cookied) {
  let table = document.getElementById("trackers");
  Object.keys(trackers).sort().sort(function(a, b) {
    return Object.keys(trackers[b]).length - Object.keys(trackers[a]).length;
  }).forEach(function(tracker) {
    let tr = document.createElement("tr");
    tr.classList.add(cookied[tracker] ? "cookied" : "uncookied");
    table.appendChild(tr);

    let blockTd = document.createElement("td");
    tr.appendChild(blockTd);

    // Allow setting or clearing the blocked state
    let blockCheck = document.createElement("input");
    blockCheck.id = "check-" + tracker;
    blockCheck.type = "checkbox";
    blockTd.appendChild(blockCheck);
    setBlocked(tracker, blocked[tracker]);

    // Track the toggle to storage
    blockTd.addEventListener("click", function() {
      self.port.emit("toggle_block", tracker);
    });

    let trackerTd = document.createElement("td");
    trackerTd.textContent = tracker;
    tr.appendChild(trackerTd);

    let tracked = Object.keys(trackers[tracker]).sort();
    let trackedTd = document.createElement("td");
    trackedTd.textContent = "(" + tracked.length + ") " + tracked.join(" ");
    tr.appendChild(trackedTd);
  });
});

// Handle changes to blocked statuses
self.port.on("update_block", setBlocked);

function setBlocked(tracker, blocked) {
  let blockCheck = document.getElementById("check-" + tracker);
  blockCheck.checked = blocked;

  let tr = blockCheck.parentNode.parentNode;
  if (blocked == "auto") {
    tr.classList.add("autoblocked");
  }
  else {
    tr.classList.remove("autoblocked");
  }
}
