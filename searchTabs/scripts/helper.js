/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const isMac = Services.appinfo.OS == "Darwin";
const isWin = Services.appinfo.OS == "WINNT";

// Take a window and create various helper properties and functions
function makeWindowHelpers(window) {
  const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

  let {clearTimeout, document, setTimeout} = window;

  // Call a function after waiting a little bit
  function async(callback, delay) {
    let timer = setTimeout(function() {
      stopTimer();
      callback();
    }, delay);

    // Provide a way to stop an active timer
    function stopTimer() {
      if (timer == null)
        return;
      clearTimeout(timer);
      timer = null;
      unUnload();
    }

    // Make sure to stop the timer when unloading
    let unUnload = unload(stopTimer, window);

    // Give the caller a way to cancel the timer
    return stopTimer;
  }

  // Replace a value with another value or a function of the original value
  function change(obj, prop, val) {
    let orig = obj[prop];
    obj[prop] = typeof val == "function" ? val(orig) : val;
    unload(function() obj[prop] = orig, window);
  }

  // Create a XUL node that can get some extra functionality
  function createNode(nodeName, extend) {
    let node = document.createElementNS(XUL, nodeName);

    // Only extend certain top-level nodes that want to be
    if (!extend)
      return node;

    // Make a delayable function that uses a sharable timer
    let makeDelayable = function(timerName, func) {
      timerName += "Timer";
      return function(arg) {
        // Stop the shared timer if it's still waiting
        if (node[timerName] != null)
          node[timerName]();

        // Pick out the arguments that the function wants
        let numArgs = func.length;
        let args;
        if (numArgs > 1)
          args = Array.slice(arguments, 0, func.length);
        function callFunc() {
          node[timerName] = null;
          if (numArgs == 0)
            func.call(global);
          else if (numArgs == 1)
            func.call(global, arg);
          else
            func.apply(global, args);
        }

        // If we have some amount of time to wait, wait
        let delay = arguments[func.length];
        if (delay)
          node[timerName] = async(callFunc, delay);
        // Otherwise do it synchronously
        else {
          callFunc();
          node[timerName] = null;
        }
      };
    }

    // Allow this node to be collapsed with a delay
    let slowHide = makeDelayable("showHide", function() node.collapsed = true);
    node.hide = function() {
      shown = false;
      slowHide.apply(global, arguments);
    };

    // Set the opacity after a delay
    node.setOpacity = makeDelayable("opacity", function(val) {
      node.style.opacity = val;
    });

    // Allow this node to be uncollapsed with a delay
    let slowShow  = makeDelayable("showHide", function() node.collapsed = false);
    node.show = function() {
      shown = true;
      slowShow.apply(global, arguments);
    };

    // Indicate if the node should be shown even if it isn't visible yet
    let shown = true;
    Object.defineProperty(node, "shown", {
      get: function() shown
    });

    return node;
  }

  // Compute the dominant color for a xhtml:img element
  function getDominantColor(image) {
    let canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    let {height, width} = image;
    canvas.height = height;
    canvas.width = width;

    let context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    // Get the rgba pixel values as 4 one-byte values
    let {data} = context.getImageData(0, 0, height, width);

    // Group each set of 4 bytes into pixels
    let pixels = [];
    for (let i = 0; i < data.length; i += 4)
      pixels.push(Array.slice(data, i, i + 4));

    return processPixels(pixels);
  }

  return {
    async: async,
    change: change,
    createNode: createNode,
    getDominantColor: getDominantColor,
    listen: function(n, e, f, c) listen(window, n, e, f, c),
    unload: function(f) unload(f, window),
  };
}

// Take pixel data for an image and find the dominant color
function processPixels(pixels) {
  // Keep track of how many times a color appears in the image
  let colorCount = {};
  let dominantColor = "";
  let maxCount = 0;

  // Process each pixel one by one
  pixels.forEach(function(data) {
    // Round the color values to the closest multiple of 24
    let [red, green, blue, alpha] = data.map(function(v) Math.round(v / 24) * 24);

    // Ignore transparent pixels
    if (alpha <= 40)
      return;

    // Ignore black-ish and white-ish
    if (Math.max(red, green, blue) <= 40 || Math.min(red, green, blue) >= 216)
      return;

    // Increment or initialize the counter
    let color = red + "," + green + "," + blue;
    colorCount[color] = (colorCount[color] || 0) + 1;

    // Keep track of the color that appears the most times
    if (colorCount[color] > maxCount) {
      maxCount = colorCount[color];
      dominantColor = color;
    }
  });

  // Break the color into rgb pieces
  return dominantColor.split(",");
}
