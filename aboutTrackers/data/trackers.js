/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Allow clearing all custom settings then redo the page
document.getElementById("reset").addEventListener("click", function() {
  self.port.emit("reset");
  document.location.reload();
});

// Fill in the threshold and add functionality
self.port.on("show_threshold", function(threshold, multiplier) {
  let cookie = document.getElementById("threshold-cookie");
  let connection = document.getElementById("threshold-connection");

  // Show the threshold values
  function updateUI() {
    cookie.textContent = threshold;
    connection.textContent = threshold * multiplier;
  }
  updateUI();

  // Update the threshold on clicks and save the value
  [["minus", -1], ["plus", 1]].forEach(function([id, delta]) {
    let button = document.getElementById("threshold-" + id);
    button.addEventListener("click", function() {
      threshold += delta;
      updateUI();
      self.port.emit("set_threshold", threshold);
    });
  });
});

// Build a table with the trackers and blocked status
self.port.on("show_trackers", function(trackers, blocked, cookied) {
  // Show trackers sorted by number of tracked sites then alphabetically
  let table = document.getElementById("trackers");
  Object.keys(trackers).sort().sort(function(a, b) {
    return Object.keys(trackers[b]).length - Object.keys(trackers[a]).length;
  }).forEach(function(tracker) {
    let tr = document.createElement("tr");
    tr.classList.add(cookied[tracker] ? "cookied" : "uncookied");
    table.appendChild(tr);

    // Allow setting or clearing the blocked state
    let blockTd = document.createElement("td");
    tr.appendChild(blockTd);
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

    // Show an alphabetical list of the tracked sites
    let tracked = Object.keys(trackers[tracker]).sort();
    let trackedTd = document.createElement("td");
    trackedTd.textContent = "(" + tracked.length + ") " + tracked.join(" ");
    tr.appendChild(trackedTd);
  });
});

// Handle changes to blocked statuses
self.port.on("update_block", setBlocked);

// Update UI for the blocked-ness of a tracker
function setBlocked(tracker, blocked) {
  let blockCheck = document.getElementById("check-" + tracker);
  blockCheck.checked = blocked;

  // Remove any existing block styles
  let tr = blockCheck.parentNode.parentNode;
  Array.slice(tr.classList).forEach(function(item) {
    if (item.indexOf("block-") == 0) {
      tr.classList.remove(item);
    }
  });

  // Style the whole row appropriately
  if (typeof blocked == "string") {
    tr.classList.add("block-" + blocked);
  }
}
