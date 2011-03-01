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
 * The Original Code is Home Dash Helper Functions.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
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

"use strict";

const isMac = Services.appinfo.OS == "Darwin";

// Use an appropriate modifier string and key for the OS
function cmd(command) {
  let key;
  let modifier = isMac ? "\u2318" : "Ctrl+";
  switch (command) {
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
    case "8":
    case "9":
      key = command;
      break;

    case "escape":
      key = "esc";
      modifier = "";
      break;

    case "location":
      key = "L";
      break;

    case "search":
      key = "K";
      break;

    case "tab":
      key = "T";
      break;
  }
  return modifier + key;
}

// Search through the adaptive info in-order for a matching query
function getAdaptiveInfo(query) {
  // Short circuit for empty queries
  let queryLen = query.length;
  if (queryLen == 0)
    return;

  // Continue until one matching adaptive data is found
  let matchingInfo;
  adaptiveData.some(function([input, pageInfo]) {
    // Not interested in an input that doesn't prefix match
    if (input.slice(0, queryLen) != query)
      return false;

    // Make sure the page info still matches the query
    if (!queryMatchesPage(query, pageInfo))
      return false;

    // Must be a good page!
    matchingInfo = pageInfo;
    return true;
  });
  return matchingInfo;
}

// Extract the sub/domains of a URI
function getHostText(URI) {
  let host = hosty(URI, true);
  try {
    // Strip the suffix unless there is no suffix (e.g., localhost)
    let suffix = Services.eTLD.getPublicSuffix(URI);
    let noSuffix = host;
    if (suffix != host)
      noSuffix = host.slice(0, (host + "/").lastIndexOf(suffix) - 1);

    // Ignore "www"-like subdomains
    let domains = noSuffix.split(".");
    if (domains[0].search(/^www\d*$/) == 0)
      domains.shift();

    // Upper-case each first letter and put subdomains in reverse order
    host = upperFirst(domains.reverse());
  }
  // eTLD will throw if it's an IP address, so just use the host
  catch(ex) {}

  // Add the scheme if it's not http(s)
  let scheme = URI.scheme;
  if (scheme.indexOf("http") == -1)
    host = scheme + ": " + host;
  return host;
}

// Give a page info if it matches a bookmark or search keyword
function getKeywordInfo(query) {
  // Do nothing for empty queries
  if (query == "")
    return;

  // First word is the keyword and everything else is parameters
  let [, keyword, params] = query.match(/^(\S+)\s*(.*)$/);

  let icon, name, url;

  // Use a keyworded search engine if available
  let engine = Services.search.getEngineByAlias(keyword);
  let bookmark = bookmarkKeywords[keyword];
  if (engine != null) {
    icon = engine.iconURI.spec;
    name = engine.name;
    url = engine.getSubmission(params).uri.spec;
  }
  // Use a bookmarked keyword otherwise
  else if (bookmark != null) {
    icon = bookmark.icon;
    name = bookmark.title;
    url = bookmark.getUrl(params);
  }

  // Nothing to give back if we didn't find anything
  if (url == null)
    return;

  // Package up as a page info
  return {
    icon: icon,
    title: params == "" ? name : name + ": " + params,
    url: url
  };
}

// Lookup all keywords to suggest for the provided query
function getKeywordSuggestions(query) {
  let queryLen = query.length;
  return sortedKeywords.filter(function(keyword) {
    return keyword.slice(0, queryLen) == query;
  });
}

// Get a favicon for a tab
function getTabIcon(tab) {
  // Use the favicon from the tab if it's there
  let src = tab.getAttribute("image");
  if (src != "")
    return src;

  // Use the default tab favicon
  return images.default16;
}

// Figure out the ordered relationship between two tabs
function getTabRelation(target, reference) {
  // Highest priority is the same tab
  if (target == reference)
    return "0self";

  // Child if the target has the reference as its parent
  if (target.HDparentId == reference.HDid)
    return "1child";

  // Friend if opened during the same session
  if (target.HDsessionId == reference.HDsessionId)
    return "2friend";

  // Sibling if matches the same sibling group
  if (target.HDsiblingId == reference.HDsiblingId)
    return "3sibling";

  // Parent if target has id of reference's parent
  if (target.HDid == reference.HDparentId)
    return "4parent";

  // No other direct relationships
  return "5none";
}

// Try to find a usable text from a node
function getTextContent(node) {
  // Nothing to do with nothing
  if (node == null)
    return "";

  // Remove extra spaces
  function cleanup(text) {
    return text.trim().replace(/\s+/, " ");
  }

  // Prefer alt text and titles when available
  if (node.alt != null && node.alt.trim() != "")
    return cleanup(node.alt);
  if (node.title != null && node.title.trim() != "")
    return cleanup(node.title);

  // Go through child nodes to find the first useful text
  let ret = "";
  Array.some(node.childNodes, function(child) {
    // Ignore certain tags as their text isn't useful
    if (child.nodeName.match(/(script|style)/i))
      return false;

    ret = getTextContent(child);
    if (ret != "")
      return true;
    return false;
  });

  // Use plain text content as a last alternative
  return ret || cleanup(node.textContent);
}

// Get something that is host-y-ish
function hosty(URI, noPort) {
  try {
    return noPort ? URI.host : URI.hostPort;
  }
  catch(ex) {}

  // Some URIs don't have a host, so fallback to path
  return URI.path;
}

// Make a page info object and fill in some data
function makePageInfo(title, url) {
  let URI = Services.io.newURI(url, null, null);
  return {
    icon: Svc.Favicon.getFaviconImageForPage(URI).spec,
    title: title || getHostText(URI),
    url: url
  };
}

// Take a window and create various helper properties and functions
function makeWindowHelpers(window) {
  const XHTML = "http://www.w3.org/1999/xhtml";
  const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

  let {document, clearTimeout, gBrowser, setTimeout} = window;

  const maxBoxObject = gBrowser.boxObject;
  const sixthWidth = maxBoxObject.width / 6;

  // Add click and drag listener to a node
  function addDragListener(node, processOffset, dragStep, dragFinish) {
    node.addEventListener("mousedown", function(event) {
      let lastProcess;
      let startX = event.screenX;
      let startY = event.screenY;

      // Process the drag offset and give it to the callback
      let unMove = listen(window, window, "mousemove", function(event) {
        lastProcess = processOffset({
          xDiff: event.screenX - startX,
          yDiff: event.screenY - startY
        });
        dragStep(lastProcess);
      });

      // Give the last processed offset when finishing
      let unUp = listen(window, window, "mouseup", function() {
        if (lastProcess != null)
          dragFinish(lastProcess);

        // Make sure to clean up the added listeners
        unMove();
        unUp();
      });
    }, false);
  }

  // Add an image with various properties
  function addImage(parent, properties) {
    let node = createNode("image");

    // Set some selected attributes or styles if provided
    for (let key in properties) {
      let val = properties[key];
      if (key in addImage.attributes)
        node.setAttribute(key, val);
      else if (key in addImage.styles)
        node.style[key] = val;
    }

    // Add the node now that it has its attributes
    parent.appendChild(node);
    return node;
  }

  // Only look for certain attributes for adding images
  addImage.attributes = {
    bottom: 1,
    collapsed: 1,
    left: 1,
    right: 1,
    src: 1,
    top: 1,
  };

  // Only look for certain styles for adding images
  addImage.styles = {
    background: 1,
    borderRadius: 1,
    boxShadow: 1,
    cursor: 1,
    height: 1,
    opacity: 1,
    padding: 1,
    pointerEvents: 1,
    width: 1,
  };

  // Watch for mouse move events that go further than some threshold
  function addMoveLimitListener(threshold, moveExceed) {
    let moveRef;
    return listen(window, window, "mousemove", function(event) {
      // Record the initial mouse position as a reference
      let {screenX, screenY} = event;
      moveRef = moveRef || {
        x: screenX,
        y: screenY
      };

      // Allow the mouse to move a little from the start reference
      let xDiff = Math.pow(screenX - moveRef.x, 2);
      let yDiff = Math.pow(screenY - moveRef.y, 2);
      if (xDiff + yDiff >= threshold)
        moveExceed();
    });
  }

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

  // Create a data url thumbnail of a browser
  function createThumbnail(browser) {
    let canvas = document.createElementNS(XHTML, "canvas");
    canvas.width = 1.15 * sixthWidth;
    canvas.height = canvas.width / 4 * 3;

    // Shrink the page a little bit
    let ctx = canvas.getContext("2d");
    ctx.scale(.3, .3);

    // Draw the page into the canvas and give back the data url
    let content = browser.contentWindow;
    let {scrollX, scrollY} = content;
    let {height, width} = maxBoxObject;
    ctx.drawWindow(content, scrollX, scrollY, width, height, "white");
    return canvas.toDataURL();
  }

  return {
    addDragListener: addDragListener,
    addImage: addImage,
    addMoveLimitListener: addMoveLimitListener,
    async: async,
    change: change,
    createNode: createNode,
    createThumbnail: createThumbnail,
    maxBoxObject: maxBoxObject,
    sixthWidth: sixthWidth,
  };
}

// Checks if a term matches on a word boundary
function matchesBoundary(term, target, casedTarget) {
  // Nothing left to do if the term doesn't show up in the rest of the target
  let pos = target.indexOf(term);
  if (pos == -1)
    return false;

  // Matching at the very beginning is a boundary success
  if (pos == 0)
    return true;

  // Otherwise, check if a middle-match is a boundary match
  do {
    // If the matching position's character is lowercase
    let at = casedTarget.charCodeAt(pos);
    if (at >= 97 && at <= 122) {
      // We're good as long as the character before is not a letter
      let prev = casedTarget.charCodeAt(pos - 1);
      if (prev < 65 || (prev > 90 && prev < 97) || prev > 122)
        return true;

      // Otherwise, continue after where it matched
      pos = target.indexOf(term, pos + 1);
      continue;
    }
    // If the matching position's character is uppercase
    else if (at >= 65 && at <= 90) {
      // We're good as long as the character before is not uppercase
      let prev = casedTarget.charCodeAt(pos - 1);
      if (prev < 65 || prev > 90)
        return true;

      // Otherwise, continue after where it matched
      pos = target.indexOf(term, pos + 1);
      continue;
    }

    // Must not have been a letter, so it's a word boundary!
    return true;

  // Keep searching until the term doesn't show up, then it must not match
  } while (pos != -1);
  return false;
}

// Sort the tabs based on the relationship to a reference tab
function organizeTabsByRelation(tabs, reference) {
  // Make a copy of the input tabs to avoid changing its order
  return tabs.slice().sort(function(a, b) {
    let relationA = getTabRelation(a, reference);
    let relationB = getTabRelation(b, reference);

    // Prefer the one with the closer relationship
    if (relationA < relationB)
      return -1;
    if (relationA > relationB)
      return 1;

    // For things with the same relation, prefer most recently used
    return (b.HDlastSelect || 0) - (a.HDlastSelect || 0);
  });
};

// Get both the original-case and lowercase prepared text
function prepareMatchText(text) {
  // Arbitrarily only search through the first some characters
  text = stripPrefix(text).slice(0, 100);
  return [text, text.toLowerCase()];
}

// Check if a query string matches some page information
function queryMatchesPage(query, {title, url}) {
  // Just short circuit if it's the empty query
  if (query == "")
    return true;

  // Use a cached query parts instead of processing each time
  let {lastQuery, queryParts} = queryMatchesPage;
  if (query != lastQuery) {
    // Remember what the cached data is used for
    queryMatchesPage.lastQuery = query;
    queryParts = queryMatchesPage.queryParts = [];

    // Get rid of prefixes and identify each term's case-ness
    stripPrefix(query).split(/[\/\s]+/).forEach(function(part) {
      // NB: Add the term to the front, so the last term is processed first as
      // it will fail-to-match faster than earlier terms that already matched
      // when doing an incremental search.
      queryParts.unshift({
        ignoreCase: part == part.toLowerCase(),
        term: part
      });
    });
  }

  // Fix up both the title and url in preparation for searching
  let [title, lowerTitle] = prepareMatchText(title);
  let [url, lowerUrl] = prepareMatchText(url);

  // Make sure every term in the query matches
  return queryParts.every(function({ignoreCase, term}) {
    // For case insensitive terms, match against the lowercase text
    if (ignoreCase) {
      return matchesBoundary(term, lowerTitle, title) ||
             matchesBoundary(term, lowerUrl, url);
    }

    // For case sensitive terms, just use the original casing text
    return matchesBoundary(term, title, title) ||
           matchesBoundary(term, url, url);
  });
}

// Remove common protocol and subdomain prefixes
function stripPrefix(text) {
  return text.replace(/^(?:(?:ftp|https?):\/{0,2})?(?:ftp|w{3}\d*)?\.?/, "");
}

// Update the input history with some input and page info
function updateAdaptive(input, pageInfo) {
  // Initialize or use the cached statement
  let stmt = updateAdaptive.stmt;
  if (stmt == null) {
    stmt = updateAdaptive.stmt = Svc.History.DBConnection.createAsyncStatement(
      "INSERT OR REPLACE INTO moz_inputhistory " +
      "SELECT h.id, :input, IFNULL(i.use_count, 0) * .9 + 1 " +
      "FROM moz_places h " +
      "LEFT JOIN moz_inputhistory i " +
      "ON i.place_id = h.id AND i.input = :input " +
      "WHERE url = :url");
  }

  // Update the places database with this information
  stmt.params.input = input;
  stmt.params.url = pageInfo.url;
  stmt.executeAsync();

  // Add the data to in-memory storage
  adaptiveData.push([input, pageInfo]);
}

// Get a upper-case-first-of-word string from an array of strings
function upperFirst(strArray) {
  return strArray.map(function(part) {
    return part.slice(0, 1).toUpperCase() + part.slice(1);
  }).join(" ");
}
