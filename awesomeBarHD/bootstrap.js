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
 * The Original Code is AwesomeBar HD.
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
const global = this;

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

// Keep a reference to the top level providers data
let allProviders;

// Keep a reference to the add-on object for various uses like disabling
let gAddon;

// Keep track of how often what part of the interface is used
let usage;

// Keep track whether delete or backspace was pressed
let deleting = false;

// Get and set preferences under the prospector pref branch
XPCOMUtils.defineLazyGetter(global, "prefs", function() {
  Cu.import("resource://services-sync/ext/Preferences.js");
  return new Preferences("extensions.prospector.awesomeBarHD.");
});

// Remove existing Firefox UI and add in custom AwesomeBar HD
function addAwesomeBarHD(window) {
  let {async, change, createNode} = makeWindowHelpers(window);
  let {document, gBrowser, gIdentityHandler, gURLBar} = window;

  // Get references to existing UI elements
  let origIdentity = gIdentityHandler._identityBox;
  let origInput = gURLBar.mInputField;

  // Add an icon to indicate the active category
  let iconBox = createNode("box");
  iconBox.setAttribute("align", "center");
  iconBox.setAttribute("collapsed", true);
  iconBox.setAttribute("id", "identity-box");
  origIdentity.parentNode.insertBefore(iconBox, origIdentity.nextSibling);

  unload(function() {
    iconBox.parentNode.removeChild(iconBox);
  });

  let providerIcon = createNode("image");
  providerIcon.setAttribute("id", "page-proxy-favicon");
  iconBox.appendChild(providerIcon);

  // Show providers at the icon if something is active
  providerIcon.handleMouse = function() {
    let {active} = categoryBox;
    if (active == null)
      return;
    active.context.openAt(providerIcon);
  };

  providerIcon.addEventListener("click", providerIcon.handleMouse, false);
  providerIcon.addEventListener("mouseover", providerIcon.handleMouse, false);

  // Add stuff around the original urlbar input box
  let urlbarStack = createNode("stack");
  origInput.parentNode.insertBefore(urlbarStack, origInput.nextSibling);

  urlbarStack.setAttribute("flex", 1);

  urlbarStack.style.overflow = "hidden";

  unload(function() {
    urlbarStack.parentNode.removeChild(urlbarStack);
  });

  // Create a dummy label that is invisible but has width to size text
  let textSizer = createNode("label");
  urlbarStack.appendChild(textSizer);

  textSizer.setAttribute("left", 0);

  textSizer.style.margin = 0;
  textSizer.style.opacity = 0;

  // Create a browser to prefetch search results
  let prefetcher = createNode("browser");
  prefetcher.setAttribute("autocompletepopup", gBrowser.getAttribute("autocompletepopup"));
  prefetcher.setAttribute("collapsed", true);
  prefetcher.setAttribute("contextmenu", gBrowser.getAttribute("contentcontextmenu"));
  prefetcher.setAttribute("tooltip", gBrowser.getAttribute("contenttooltip"));
  prefetcher.setAttribute("type", "content");
  gBrowser.appendChild(prefetcher);

  // Generate the url for the category and provider and prefetch if necessary
  prefetcher.load = function(category, index) {
    // Use the default index/provider if we don't have one
    let {defaultIndex, providers} = category.categoryData;
    if (index == null)
      index = defaultIndex;

    // Determine the space character to replace in the query
    const termRegex = /{search(.)terms}/;
    let {url} = providers[index];
    let spaceChar = url.match(termRegex)[1];

    // Strip off the keyword based on the current active category
    let {value} = hdInput;
    if (categoryBox.active != goCategory) {
      value = encodeURIComponent(value.replace(/^[^:]*:\s*/, ""));
      value = value.replace(/%20/g, spaceChar);
    }

    // Fill in the search term with the current query
    url = url.replace(termRegex, value);

    // Prefetch the search results if not going to a page
    if (category != goCategory) {
      // Only prefetch if we have something new
      if (prefetcher.lastUrl != url) {
        prefetcher.loadURI(url);
        prefetcher.lastUrl = url;
      }
    }

    return url;
  };

  // Only prefetch if currently prefetching
  prefetcher.loadIfSearching = function(category, index) {
    if (categoryBox.active != goCategory)
      prefetcher.load(category, index);
  };

  // Save the prefetched page to a tab in the browser
  prefetcher.persistTo = function(targetTab) {
    let targetBrowser = targetTab.linkedBrowser;
    targetBrowser.stop();

    // Unhook our progress listener
    let selectedIndex = targetTab._tPos;
    const filter = gBrowser.mTabFilters[selectedIndex];
    let tabListener = gBrowser.mTabListeners[selectedIndex];
    targetBrowser.webProgress.removeProgressListener(filter);
    filter.removeProgressListener(tabListener);
    let tabListenerBlank = tabListener.mBlank;

    // Restore current registered open URI
    let previewURI = prefetcher.currentURI;
    let openPage = gBrowser._placesAutocomplete;
    if (targetBrowser.registeredOpenURI) {
      openPage.unregisterOpenPage(targetBrowser.registeredOpenURI);
      delete targetBrowser.registeredOpenURI;
    }
    openPage.registerOpenPage(previewURI);
    targetBrowser.registeredOpenURI = previewURI;

    // Save the last history entry from the preview if it has loaded
    let history = prefetcher.sessionHistory.QueryInterface(Ci.nsISHistoryInternal);
    let lastEntry;
    if (history.count > 0) {
      lastEntry = history.getEntryAtIndex(history.index, false);
      history.PurgeHistory(history.count);
    }

    // Copy over the history from the target browser if it's not empty
    let origHistory = targetBrowser.sessionHistory;
    for (let i = 0; i <= origHistory.index; i++) {
      let origEntry = origHistory.getEntryAtIndex(i, false);
      if (origEntry.URI.spec != "about:blank")
        history.addEntry(origEntry, true);
    }

    // Add the last entry from the preview; in-progress preview will add itself
    if (lastEntry != null)
      history.addEntry(lastEntry, true);

    // Swap the docshells then fix up various properties
    targetBrowser.swapDocShells(prefetcher);
    targetBrowser.webNavigation.sessionHistory = history;
    targetBrowser.attachFormFill();
    gBrowser.setTabTitle(targetTab);
    gBrowser.updateCurrentBrowser(true);
    gBrowser.useDefaultIcon(targetTab);

    // Restore the progress listener
    tabListener = gBrowser.mTabProgressListener(targetTab, targetBrowser, tabListenerBlank);
    gBrowser.mTabListeners[selectedIndex] = tabListener;
    filter.addProgressListener(tabListener, Ci.nsIWebProgress.NOTIFY_ALL);
    targetBrowser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL);

    // Forget what was prefetched as it's now gone
    prefetcher.lastUrl = null;
  };

  unload(function() {
    prefetcher.parentNode.removeChild(prefetcher);
  });

  // Prevent errors from browser.js/xul when it gets unexpected title changes
  prefetcher.addEventListener("DOMTitleChanged", function(event) {
    event.stopPropagation();
  }, true);

  // Add an area to show a list of categories
  let categoryBox = createNode("hbox");
  urlbarStack.appendChild(categoryBox);

  categoryBox.setAttribute("flex", 1);
  categoryBox.setAttribute("pack", "end");

  categoryBox.style.cursor = "text";
  categoryBox.style.overflow = "hidden";
  categoryBox.style.pointerEvents = "none";
  
  // Add an area to show complete category suggestion
  let completePanel = createNode("hbox");
  urlbarStack.appendChild(completePanel);

  completePanel.setAttribute("flex", 1);
  completePanel.setAttribute("pack", "end");
  completePanel.setAttribute("collapsed", true);

  completePanel.style.overflow = "hidden";
  completePanel.style.pointerEvents = "none";

  //Helper function to convert url to name.
  function firstCapital(word) {
    if(word!= null)
      return word.substr(0,1).toUpperCase()+word.substr(1);
    else
      return "";
  }
  
  function makeWord(url) {
    return firstCapital(url.replace("www.","").replace(/^(https:\/\/|http:\/\/)+/,"").split(".")[0]);    
  }
  
  //Figure out if the current input text is activating any provider of category.
  function checkInputForProviders(label,shortValue) {
    let {categoryData} = label;
    let {providers} = categoryData;
	
    for(let i=0;i<providers.length;i++){
      let {url, name} = providers[i];
      if (shortValue == makeWord(url).toLowerCase().slice(0,shortValue.length) || shortValue ==  makeWord(name).toLowerCase().slice(0,shortValue.length))
        return i;
    }
    return -1;
  } 

  //Show category suggestion as we type
  function suggestCategory() {
    let {complete} = categoryBox;
	
    if(complete == null)
      return;
	
    let {providers, defaultIndex, keyword} = complete.categoryData;
    let {value, selectionStart} = hdInput;
    let {url, name} = providers[defaultIndex];
	
    if(keyword.slice(0, selectionStart) == value.slice(0, selectionStart)) {
      hdInput.value = keyword;	  
      hdInput.setSelectionRange(selectionStart, keyword.length);	
    }
    else if(makeWord(url).toLowerCase().slice(0, selectionStart) == value.slice(0,selectionStart)) {
      hdInput.value = makeWord(url).toLowerCase();	  
      hdInput.setSelectionRange(selectionStart, makeWord(url).length);
    }
    else {
      hdInput.value = makeWord(name).toLowerCase();	  
      hdInput.setSelectionRange(selectionStart, makeWord(name).length);
    }

    //Reflect the hdInput value back to gURLBar
    let {value, selectionStart, selectionEnd} = hdInput;
    origInput.value= value;
    origInput.setSelectionRange(selectionStart,selectionEnd);
  }
  
  // Look for deletes to handle them better on input
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_BACK_SPACE:		
      case event.DOM_VK_DELETE:
        deleting = true;
        break;
    }
  });


  // Take pixel data for an image and find the dominant color
  function processPixels(pixels) {
    // Keep track of how many times a color appears in the image
    let colorCount = {};
    let dominantColor = "";
    let maxCount = 0;

    // Process each pixel one by one
    pixels.forEach(function(data) {
      // Round the color values to the closest multiple of 8
      let [red, green, blue, alpha] = data.map(function(v) Math.round(v / 8) * 8);

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

  //// Compute the dominant color for a xhtml:img element
  function getDominantColor(image) {
    let canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    let {height, width} = image;
    if (height <= 0 || width <= 0 || !height || !width)
      return "255,255,255";
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

  // Activate a category with an optional provider index
  categoryBox.activate = function(categoryNode, index) {
    usage.activate++;

    // Most likely don't want to search the current url, so remove on activate
    let {selectionEnd, selectionStart, value} = hdInput;
    if (value == getURI().spec)
      value = "";

    // Remove any active query terms when activating another
    let query = value;
    if (categoryBox.active != goCategory)
      query = query.replace(/^[^:]*:\s*/, "");

    // Remove the short keyword from the query on tab complete
    let {category, keyword} = categoryNode.categoryData;
    let shortKeyword = keyword.slice(0, selectionStart);
    let shortQuery = query.slice(0, selectionStart);
    if (shortKeyword != "" && shortQuery == shortKeyword) {
      query = query.slice(selectionEnd);
      sendEvent("complete", category);
    }

    // Update the text with the active keyword
    hdInput.value = keyword;	
    
    let {complete} = categoryBox;    
    //If we were not completing to a category, then add the query also.
    if (complete == null) {
      hdInput.value+=query;
      // Highlight the completed keyword if there's a query
      let {length} = keyword;
      hdInput.setSelectionRange(query == "" ? length : 0, length);
    }

    // Switch to a particular provider if necessary
    if (index != null)
      categoryNode.setIndex(index);

    // Update the autocomplete results now that we've activated
    categoryBox.processInput();
    gURLBar.mController.handleText();
    hdInput.focus();
  };

  // Immediately go to the result page if there's something to search
  categoryBox.activateAndGo = function(categoryNode, index) {
    usage.activateAndGo++;

    // Remember if there's completely no input
    let empty = hdInput.value == "";
    categoryBox.activate(categoryNode, index);

    // Animate in the now filled-in category towards the left
    if (empty && usage.emptyClick++ < 3) {
      let maxOffset = categoryNode.boxObject.x - urlbarStack.boxObject.x;
      let maxSteps = 10;
      let step = 0;

      // Hide the category box and animate in the text
      categoryBox.collapsed = true;
      let animate = function() {
        // Restore the original look
        if (step == maxSteps) {
          categoryBox.collapsed = false;
          hdInput.removeAttribute("left");
          return;
        }

        // Figure out where to position the text
        let frac = step++ / maxSteps;
        hdInput.setAttribute("left", maxOffset * (1 - Math.pow(frac, 3)));
        async(animate, 40);
      };
      animate();
    }

    // Only go if it's not just blank
    let {value} = hdInput;
    if (value.search(/:\s*\S/) == -1)
      return;

    usage.activateAndWent++;
    if (!empty)
      usage.providerSwitch++;

    gURLBar.handleCommand();
  };

  // Select the keyword if the cursor is in the keyword
  categoryBox.checkSelection = function() {
    if (categoryBox.active == goCategory)
      return;

    // Move the selection boundaries if they're inside the keyword
    let {selectionEnd, selectionStart, value} = hdInput;
    let queryStart = value.match(/^[^:]*:\s*/)[0].length;
    if (selectionStart <= queryStart)
      hdInput.selectionStart = 0;
    if (selectionEnd < queryStart)
      hdInput.selectionEnd = queryStart;
  };

  // Look through the input to decide what category could be activated
  categoryBox.prepareNext = function() {
    // Try finding a category to complete
    let {active} = categoryBox;
    categoryBox.complete = null;

    // See if there's any potential category to complete with tab
    let {selectionStart, value} = hdInput;
    let shortValue = value.slice(0, selectionStart);
    let {length} = shortValue;
    if (length > 0 && active == goCategory) {
      Array.some(categoryBox.childNodes, function(label) {
        // Skip non-categories and the current active
        let {categoryData} = label;
        if (categoryData == null || label == active || categoryData.hidden == true)
          return;

        let {keyword} = categoryData;
        if (keyword == "")
          return;
        if (shortValue == keyword.slice(0, length)) {
          categoryBox.complete = label;
          return true;
        }
        let index = checkInputForProviders(label,shortValue);
	if (index >= 0) {          
	  categoryBox.complete = label;
	  categoryBox.complete.categoryData.defaultIndex = index;		  
	  return true;
	}
      });
    }

    let temp = categoryBox.active.nextSibling.nextSibling;
    // Prepare a next visible category and wrap if at the very end
    while (temp && temp.categoryData.hidden) {
      temp = temp.nextSibling.nextSibling;
    }
    if (!temp)
      temp = goCategory;

    categoryBox.next = temp;

    let temp = (categoryBox.active != goCategory) ?
      categoryBox.active.previousSibling.previousSibling : categoryBox.lastChild.previousSibling;
    // Prepare a previous category unless already at the beginning and category not hidden
    while (temp && temp.categoryData.hidden && temp != goCategory) {
      temp = temp.previousSibling.previousSibling;
    }
    categoryBox.prev = temp;
  };

  // Figure out if the current input text is activating a category
  categoryBox.processInput = function() {
    // Figure out what's the active category based on the input
    let {value} = hdInput;
    let inputParts = value.match(/^([^:]*):\s*(.*?)$/);
    categoryBox.active = goCategory;
    if (inputParts != null) {
      let inputKeyword = inputParts[1];
      Array.some(categoryBox.childNodes, function(label) {
        let {categoryData} = label;
        if (categoryData == null || categoryData.hidden == true)
          return;
        let {keyword} = categoryData;
        if (keyword == "")
          return;
        if (inputKeyword == keyword.slice(0, inputKeyword.length)) {
          categoryBox.active = label;
          return true;
        }
        let index = checkInputForProviders(label,inputKeyword);
	if (index >= 0) {          
	  categoryBox.active = label;
	  categoryBox.active.categoryData.defaultIndex = index;		  
	  return true;
	}
      });
    }

    // Update the UI now that we've figured out various states
    categoryBox.prepareNext();
    categoryBox.updateLook();

    // Convert the input into a url for the location bar and prefetch
    let {active} = categoryBox;
    gURLBar.value = prefetcher.load(active);

    // Only show results for going to a history page
    gURLBar.popup.collapsed = active != goCategory;

    // Save the input value to restore later if necessary
    gBrowser.selectedTab.HDinput = value;
    gBrowser.selectedTab.HDinputtedAt = Date.now();
  };

  // Clear out various state of the current input
  categoryBox.reset = function() {
    categoryBox.active = null;
    categoryBox.complete = null;
    categoryBox.next = null;
    categoryBox.hover = null;
    categoryBox.prev = null;
    categoryBox.updateLook();
  };

  // Differently color certain categories depending on state
  categoryBox.updateLook = function() {
    // Restore some UI like the identity box
    let {active, hover} = categoryBox;
    if (active == null) {
      gBrowser.selectedTab.HDinput = "";
      hdInput.value = "";
    }
    // Prepare the UI for showing an active category
    else {
      let {defaultIndex, providers} = active.categoryData;
      let {icon} = providers[defaultIndex];
      if (icon == null)
        providerIcon.removeAttribute("src");
      else
        providerIcon.setAttribute("src", icon);
    }

    // Check if the input looks like a url
    let {value} = hdInput;
    let likeUrl = value.indexOf(" ") == -1 && value.indexOf("/") != -1;

    // Calculate the width of the input text plus some padding
    textSizer.setAttribute("value", value);
    let inputWidth = textSizer.boxObject.width + 5;

    // Go through each label and style it appropriately
    let focused = gURLBar.hasAttribute("focused");
    let doActive = focused || value != "";
    Array.forEach(categoryBox.childNodes, function(label) {
      let {categoryData, style} = label;

      let color = "#999";
      let line = false;
      if (label == active && doActive)
        color = "#090";
      else if (focused || label == hover) {
        color = "#00f";
        line = true;
      }
      style.color = color;
      style.textDecoration = line && categoryData != null ? "underline" : "";
    });

    // Hide the url parts if it's about:blank or active
    let isBlank = getURI().spec == "about:blank";
    let hideUrl = isBlank || doActive;
    urlBox.collapsed = hideUrl;

    // Hide categories for long url inputs or when showing url parts
    categoryBox.collapsed = likeUrl || !hideUrl;

    // Show the next category if focus is in the box
    if (focused && !likeUrl)
      tabPanel.showNextCategory();
    else
      tabPanel.hidePopup();

    // Show the original identity box when inactive
    origIdentity.collapsed = doActive;
    iconBox.collapsed = !doActive;

    // Figure out if we should blank out the categories and separators
    if (!categoryBox.collapsed) {
      Array.forEach(categoryBox.childNodes, function(label) {
        if (label.categoryData == null)
          return;

        // Make it transparent if its left side would cover text
        let fromLeft = label.boxObject.x - categoryBox.boxObject.x;
        let opacity = fromLeft < inputWidth ? 0 : 1;
        label.style.opacity = opacity;
        label.nextSibling.style.opacity = opacity;
      });
    }
  };

  // Pointing away removes the go category highlight
  categoryBox.addEventListener("mouseout", function(event) {
    if (event.target != categoryBox)
      return;
    categoryBox.hover = null;
    categoryBox.updateLook();
  }, false);

  // Indicate the default behavior of a click is go
  categoryBox.addEventListener("mouseover", function(event) {
    if (event.target != categoryBox)
      return;
    if (gURLBar.hasAttribute("focused"))
      return;
    categoryBox.hover = goCategory;
    categoryBox.updateLook();
  }, false);

  // Select the text to edit for a website
  categoryBox.addEventListener("click", function(event) {
    if (event.target != categoryBox && event.target != goCategory)
      return;
    hdInput.focus();
    hdInput.select();
  }, false);

  // Create a category label
  function addCategory(categoryData) {
    let {category, keyword, providers, text} = categoryData;

    let categoryNode = createNode("hbox");
    categoryBox.appendChild(categoryNode);

    categoryNode.style.cursor = "pointer";
    categoryNode.style.marginRight = "-1px";
    categoryNode.style.pointerEvents = "auto";

    categoryNode.categoryData = categoryData;

    let image = createNode("image");
    categoryNode.appendChild(image);

    image.setAttribute("src", providers[categoryData.defaultIndex].icon);

    image.style.pointerEvents = "none";

    let label = createNode("label");
    categoryNode.appendChild(label);

    label.setAttribute("value", text);

    label.style.margin = 0;
    label.style.pointerEvents = "none";

    // Allow changing the default index and updating the UI for it
    categoryNode.setIndex = function(index) {
      if (categoryData.defaultIndex == index)
        return;

      let {icon, name} = providers[index];
      categoryData.defaultIndex = index;
      image.setAttribute("src", icon);
      sendEvent("set " + category, name);
    };

    // Show or reshow the menu when clicking the label
    function onClick() {
      context.openAt(categoryNode);
    }

    // Open the context menu when moving over the related labels
    let hoverTimer;
    function onMove() {
      // Already have a timer active, so nothing to do
      if (hoverTimer != null)
        return;

      // Start a timer to delay showing the menu
      hoverTimer = async(function() {
        hoverTimer = null;

        // Only show the menu if this label is still being pointed at
        if (categoryBox.hover != categoryNode)
          return;
        context.openAt(categoryNode);
      }, 100);
    }

    // Handle the mouse moving in or out of the related labels
    function onMouse({type, relatedTarget}) {
      // Ignore events between the two related labels
      if (relatedTarget == categoryNode || relatedTarget == comma)
        return;

      // Keep track of what is currently being hovered
      categoryBox.hover = type == "mouseover" ? categoryNode : null;

      // Keep the original look of the hover if the menu is open
      if (context.state != "open")
        categoryBox.updateLook();
    }

    categoryNode.addEventListener("click", onClick, false);
    categoryNode.addEventListener("mousemove", onMove, false);
    categoryNode.addEventListener("mouseout", onMouse, false);
    categoryNode.addEventListener("mouseover", onMouse, false);

    // Add a comma after each category
    let comma = createNode("label");
    categoryBox.appendChild(comma);

    comma.separator = true;

    comma.style.margin = 0;
    comma.style.pointerEvents = "auto";

    comma.addEventListener("click", onClick, false);
    comma.addEventListener("mousemove", onMove, false);
    comma.addEventListener("mouseout", onMouse, false);
    comma.addEventListener("mouseover", onMouse, false);

    // Prepare a popup to show category providers
    let context = createNode("menupopup");
    categoryNode.context = context;
    document.getElementById("mainPopupSet").appendChild(context);

    // Add a menuitem that knows how to switch to the provider
    providers.forEach(function({icon, name}, index) {
      let provider = createNode("menuitem");
      provider.setAttribute("class", "menuitem-iconic");
      provider.setAttribute("image", icon);
      provider.setAttribute("label", name);
      context.appendChild(provider);

      provider.addEventListener("command", function() {
        usage.clickProvider++;
        categoryBox.activateAndGo(categoryNode, index);
      }, false);

      // Prefetch in-case the provider is selected
      provider.addEventListener("mouseover", function() {
        prefetcher.loadIfSearching(categoryNode, index);
      }, false);

      return provider;
    });

    context.appendChild(createNode("menuseparator"));

    // Allow switching from text to icons
    let switchToIcon = createNode("menuitem");
    context.appendChild(switchToIcon);

    switchToIcon.setAttribute("label", "Show an icon instead of '" + text + "'");

    switchToIcon.addEventListener("command", function() {
      switchTo(true);
      sendEvent("icon", category);
    }, false);

    // Allow switching from icons to text
    let switchToText = createNode("menuitem");
    context.appendChild(switchToText);

    switchToText.setAttribute("label", "Show '" + text + "' instead of an icon");

    switchToText.addEventListener("command", function() {
      switchTo(false);
      sendEvent("text", category);
    }, false);

    // Save the state and update the UI to show icons or text
    function switchTo(icon) {
      categoryData.showIcon = icon;

      switchToIcon.collapsed = icon;
      switchToText.collapsed = !icon;
      image.collapsed = !icon;
      label.collapsed = icon;

      fixSeparators();
    }

    // Hide one of the switch commands depending on if icons are shown
    switchTo(categoryData.showIcon);

    // Allow the whole category to be hidden from the UI
    let hideCategory = createNode("menuitem");
    context.appendChild(hideCategory);

    hideCategory.setAttribute("label", "Hide this category");

    hideCategory.addEventListener("command", function() {
      hideShowCategory(true);
      sendEvent("hide", category);
    }, false);

    // Allow the whole category to be restored from the UI
    let showCategory = createNode("menuitem");
    context.appendChild(showCategory);

    showCategory.setAttribute("label", "Show this category");

    showCategory.addEventListener("command", function() {
      hideShowCategory(false);
      sendEvent("show", category);
    }, false);

    // Save the state and update the UI to hide or show the category
    function hideShowCategory(hide) {
      categoryData.hidden = hide;

      categoryNode.collapsed = hide;
      comma.collapsed = hide;
      hideCategory.collapsed = hide;
      showCategory.collapsed = !hide;

      fixSeparators();
    }

    // Hide the category if necessary
    hideShowCategory(categoryData.hidden);

    // Allow opening the context under a node
    context.openAt = function(node) {
      if (isInactive())
        return;
      if (context.state == "open")
        return;
      if (category == "go")
        return;

      context.updateChecked();
      context.openPopup(node, "after_start", isMac ? -21 : 0);
    };

    // Correctly mark which item is the default
    context.updateChecked = function() {
      let {defaultIndex} = categoryData;
      Array.forEach(context.childNodes, function(item, index) {
        if (index == defaultIndex)
          item.setAttribute("checked", true);
        else
          item.removeAttribute("checked");
      });
    };

    context.updateChecked();

    unload(function() {
      context.parentNode.removeChild(context);
    });

    // Track when the menu disappears to maybe activate
    let unOver;
    context.addEventListener("popuphiding", function() {
      unOver();

      // Assume dismiss of the popup by clicking on the label is to activate
      if (categoryBox.hover == categoryNode) {
        usage.clickCategory++;
        categoryBox.activateAndGo(categoryNode);
      }
      // Make sure the original input is prefetched
      else
        categoryBox.processInput();
    }, false);

    // Prepare to dismiss for various reasons
    context.addEventListener("popupshowing", function() {
      // Automatically hide the popup when pointing away
      unOver = listen(window, window, "mouseover", function(event) {
        // Allow pointing at the category label
        switch (event.originalTarget) {
          case categoryNode:
          case comma:
            return;
        }

        // Allow pointing at the menu
        let {target} = event;
        if (target == context)
          return;

        // And the menu items
        if (target.parentNode == context)
          return;

        // Must have pointed away allowed items, so dismiss
        context.hidePopup();
      });

      // Prefetch in preparation of a click on the label to dismiss
      prefetcher.loadIfSearching(categoryNode);
    }, false);

    return categoryNode;
  }

  // Add each category to the UI and remember some special categories
  allProviders.forEach(addCategory);
  let goCategory = categoryBox.firstChild;
  let searchCategory = goCategory.nextSibling.nextSibling;
  categoryBox.lastChild.setAttribute("value", ".");

  // Make sure every separator is a comma except the last visible one
  function fixSeparators() {
    let lastSeparator;
    Array.forEach(categoryBox.childNodes, function(node) {
      if (node.collapsed || !node.separator)
        return;

      // Put a comma after a text category, otherwise just a space
      let {showIcon} = node.previousSibling.categoryData;
      node.setAttribute("value", showIcon ? " " : ", ");

      lastSeparator = node;
    });

    // If we have a visible last separator, make it a period
    if (lastSeparator != null)
      lastSeparator.setAttribute("value", ".");
  }
  fixSeparators();

  // For now hide the go category
  goCategory.setAttribute("collapsed", true);
  goCategory.nextSibling.setAttribute("collapsed", true);

  // Copy most of the original input field
  let hdInput = origInput.cloneNode(false);
  urlbarStack.insertBefore(hdInput, categoryBox);

  // Hide the original input
  change(origInput.style, "maxWidth", 0);
  change(origInput.style, "overflow", "hidden");

  hdInput.removeAttribute("onblur");
  hdInput.removeAttribute("onfocus");
  hdInput.removeAttribute("placeholder");

  hdInput.addEventListener("blur", function() {
    let url = getURI().spec;
    if (hdInput.value == url) {
      hdInput.value = "";
      categoryBox.processInput();
    }
    else
      categoryBox.updateLook();

    // Make sure revert various state to get the right page proxy state
    gBrowser.userTypedValue = null;
    window.URLBarSetURI();
  }, false);

  hdInput.addEventListener("click", function() {
    categoryBox.checkSelection();
  }, false);

  hdInput.addEventListener("focus", function() {
    gURLBar.setAttribute("focused", true);
    categoryBox.processInput();
  }, false);

  // Watch for inputs to handle from keyboard and from other add-ons
  hdInput.addEventListener("input", function() {
    // Don't try suggesting a keyword when the user wants to delete
    if (deleting) {
      deleting = false;
      return;
    }
    // Copy over the new value and selection if it changed while not searching
    let {HDlastValue, selectionEnd, selectionStart, value} = origInput;
    if (HDlastValue != value) {
      hdInput.value = value;
      hdInput.setSelectionRange(selectionStart, selectionEnd);
    }
    categoryBox.processInput();
    suggestCategory();
  }, false);

  // Allow escaping out of the input
  hdInput.addEventListener("keydown", function(event) {
    if (event.keyCode != event.DOM_VK_ESCAPE)
      return;

    // Keep the focus in the input box instead of blurring
    event.preventDefault();

    // Return focus to the browser if already empty
    if (hdInput.value == "")
      gBrowser.selectedBrowser.focus();
    // Empty out the input on first escape
    else {
      hdInput.value = "";
      categoryBox.processInput();
    }
  }, false);

  // Detect cursor movements to auto-select the keyword
  hdInput.addEventListener("keypress", function(event) {
    let {active} = categoryBox;
    if (active == goCategory)
      return;

    // Only care about the various keys can cause the cursor to move
    switch (event.keyCode) {
      case event.DOM_VK_END:
      case event.DOM_VK_DOWN:
      case event.DOM_VK_HOME:
      case event.DOM_VK_LEFT:
      case event.DOM_VK_RIGHT:
      case event.DOM_VK_UP:
        break;

      default:
        return;
    }

    // Don't re-select if there's a selection of the keyword already
    let {selectionEnd, selectionStart, value} = hdInput;
    let queryStart = value.match(/^[^:]*:\s*/)[0].length;
    if (selectionEnd == queryStart && selectionStart != queryStart)
      return;

    // Must not be selecting or cursor is at the query, so select, but wait for
    // the cursor to actually move before detecting the selection
    async(function() categoryBox.checkSelection());
  }, false);

  // Specially handle some navigation keys
  hdInput.addEventListener("keyup", function(event) {
    switch (event.keyCode) {
      // Fill in autocomplete values when selecting them
      case event.DOM_VK_DOWN:
      case event.DOM_VK_UP:
        if (categoryBox.active == goCategory) {
          hdInput.value = origInput.value;
          categoryBox.updateLook();
        }
        break;

      // Update what category is next when moving the cursor
      case event.DOM_VK_LEFT:
      case event.DOM_VK_RIGHT:
        categoryBox.prepareNext();
        categoryBox.updateLook();
        break;
    }
  }, false);

  // Detect tab switches to restore previous input
  listen(window, gBrowser.tabContainer, "TabSelect", function() {
    // Treat stale inputs as empty
    let {HDinput, HDinputtedAt} = gBrowser.selectedTab;
    if (HDinputtedAt != null && Date.now() - HDinputtedAt > 180000) {
      HDinput = "";

      // Pretend the location bar wasn't focused to begin with
      gBrowser.selectedBrowser._urlbarFocused = false;
    }

    hdInput.value = HDinput || "";
    categoryBox.processInput();
  });

  // Remember what was just inputted to detect if we need to copy over
  listen(window, gURLBar.parentNode, "input", function({originalTarget}) {
    if (originalTarget == hdInput)
      origInput.HDlastValue = origInput.value = hdInput.value;
  });

  // Allow switching providers with modified up/down
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    let {active} = categoryBox;
    if (active == goCategory)
      return;

    // Only look for modified key presses
    if (!(event.altKey || event.ctrlKey || event.metaKey))
      return;

    // Figure out what provider to select next
    let index;
    let {categoryData} = active;
    let {defaultIndex, providers} = categoryData;
    switch (event.keyCode) {
      case event.DOM_VK_DOWN:
        if (defaultIndex != providers.length - 1)
          index = defaultIndex + 1;
        break;

      case event.DOM_VK_UP:
        if (defaultIndex != 0)
          index = defaultIndex - 1;
        break;

      default:
        return;
    }

    // Don't allow the cursor to move or controller from filling
    event.preventDefault();
    event.stopPropagation();

    // Activate the provider if it's not already at the edges
    if (index != null)
      categoryBox.activate(active, index);
  });

  // Allow tab completion to activate
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    if (event.keyCode != event.DOM_VK_TAB)
      return;

    // Let ctrl-tab do the usual tab switching
    if (event.ctrlKey)
      return;
    
    event.preventDefault();
    event.stopPropagation();
	
    // Only allow switching when the query isn't highlighted
    function canSwitch() {
      // Can always switch when nothing is selected
      let {selectionEnd, selectionStart, value} = origInput;
      if (selectionEnd == selectionStart)
        return true;

      // Allow switching if the selection is before the query
      let queryStart = 0;
      return selectionEnd < value.length ;
    }

    // Allow moving backwards through categories
    let {complete, next, prev} = categoryBox;	
    let {selectionStart, selectionEnd, value} = origInput;
    if (event.shiftKey && canSwitch()) {
      usage.tabPrev++;
      categoryBox.activate(prev);
    }
    // Allow tab completion of a category
    else if (complete != null) {
      usage.tabComplete++;
      categoryBox.activate(complete);	  
    }
    //If there is no category to complete and we can't switch, 
    //Copy over the new value and selection if it changed when not searching
    else if (selectionStart<selectionEnd && selectionEnd==value.length) {
      let {selectionStart, selectionEnd, value} = hdInput;
      origInput.HDlastValue = origInput.value = value;
      origInput.setSelectionRange(selectionStart, selectionEnd);
      gURLBar.mController.handleText();      
    }
    // Allow moving forwards through categories
    else if (canSwitch()) {
      usage.tabNext++;
      categoryBox.activate(next);	  
    }
  });

  // Activate the go category when dismissing the autocomplete results
  listen(window, gURLBar.popup, "popuphiding", function() {
    if (categoryBox.hover == goCategory)
      categoryBox.activate(goCategory);
  });

  // Redirect focus from the original input to the new one
  listen(window, origInput, "focus", function(event) {
    origInput.blur();
    document.getElementById("Browser:OpenLocation").doCommand();
  }, false);

  // Hook into the user selecting a result
  change(gURLBar, "handleCommand", function(orig) {
    return function(event) {
      // Just load the page into the current tab
      let {active} = categoryBox;
      if (active == goCategory) {
        categoryBox.reset();
        // Open pages into a new tab instead of replacing app tabs
        let isMouse = event instanceof window.MouseEvent;
        let proxy = !gBrowser.selectedTab.pinned ? event : {
          __proto__: event,
          altKey: true,
          ctrlKey: isMouse,
          metaKey: isMouse,
        };
        return orig.call(this, proxy);
      }

      // Reuse the current tab if it's empty
      let targetTab = gBrowser.selectedTab;

      // Prepare a new tab with the current search input
      if (!window.isTabEmpty(targetTab)) {
        targetTab = gBrowser.addTab();
        targetTab.HDinput = hdInput.value;
        categoryBox.reset();
      }

      // Remember what loaded to clear when navigating
      targetTab.HDloadedUrl = prefetcher.lastUrl;

      prefetcher.persistTo(targetTab);
      gBrowser.selectedBrowser.focus();
      gBrowser.selectedTab = targetTab;

      // Show the other providers as a hint to switch
      if (usage.providerSwitch < 1 && usage.activate < 30)
        async(function() active.context.openAt(providerIcon), 100);

      let {category, defaultIndex, providers} = active.categoryData;
      sendEvent("search", category + " " + providers[defaultIndex].name);
    };
  });

  // Clear out any previous input when navigating somewhere
  change(gBrowser, "setTabTitleLoading", function(orig) {
    return function(tab) {
      if (tab == gBrowser.selectedTab) {
        // Reset if the location is now different
        let {HDinputtedAt, HDloadedUrl} = tab;
        if (HDloadedUrl != null && HDloadedUrl != getURI().spec) {
          categoryBox.reset();
          tab.HDloadedUrl = null;
        }
        // Clear out whatever was typed after it's been there for a bit
        else if (HDinputtedAt != null && Date.now() - HDinputtedAt > 10000) {
          categoryBox.reset();
          tab.HDinputtedAt = null;
        }
      }
      return orig.call(this, tab);
    };
  });

  // Show parts of the url with different prioritites
  let urlBox = createNode("hbox");
  urlbarStack.appendChild(urlBox);

  urlBox.setAttribute("left", 1);
  urlBox.setAttribute("right", 0);

  urlBox.style.color = "#aaa";
  urlBox.style.cursor = "text";

  // Do slightly different behavior if the user clicked white space or text
  urlBox.addEventListener("mouseup", function(event) {
    if (event.target == urlBox) {
      hdInput.focus();
      return;
    }

    // Allow clicking the domain text to open a new tab/window
    if (domainText.style.textDecoration != "") {
      let domain = getURI().prePath;
      window.openUILinkIn(domain, window.whereToOpenLink(event, false, true), {
        relatedToCurrent: true,
      });

      let {altKey, ctrlKey, metaKey, shiftKey} = event;
      sendEvent("domain click", (altKey ? "a" : "") + (ctrlKey ? "c" : "") +
                                (metaKey ? "m" : "") + (shiftKey ? "s" : ""));
      return;
    }

    // Fill in the location for clicking on the url
    document.getElementById("Browser:OpenLocation").doCommand();
  }, false);

  // Immediately reset style when moving away
  urlBox.addEventListener("mouseout", function() {
    urlBox.hovering = false;
    urlBox.style.color = "#aaa";
    urlBox.style.opacity = 1;
  }, false);

  // Delay changing the style in-case the mouse happens to pass by
  urlBox.addEventListener("mouseover", function({target}) {
    urlBox.hovering = true;

    // Wait a bit and check if the mouse hasn't left before styling
    async(function() {
      if (!urlBox.hovering)
        return;

      // Must not be pointing at the url text, so fade for clearing
      if (target == urlBox) {
        urlBox.style.opacity = .4;
        return;
      }

      // Darken the url text when hovering
      urlBox.style.color = "black";
      urlBox.style.opacity = 1;
    }, 100);
  }, false);

  let preDomain = createNode("label");
  urlBox.appendChild(preDomain);
  preDomain.setAttribute("collapsed", true);

  let domainText = createNode("label");
  urlBox.appendChild(domainText);

  domainText.style.color = "black";

  let postDomain = createNode("label");
  urlBox.appendChild(postDomain);

  postDomain.setAttribute("crop", "end");

  // Make the url look clickable when a modifier key is pressed
  [preDomain, domainText, postDomain].forEach(function(label) {
    label.style.margin = 0;

    label.addEventListener("mousemove", function(event) {
      let cursor = "text";
      let text = "";
      let {altKey, ctrlKey, metaKey, shiftKey} = event;
      if (altKey || ctrlKey || metaKey || shiftKey) {
        cursor = "pointer";
        text = "underline";
      }

      domainText.style.textDecoration = text;
      label.style.cursor = cursor;
    }, false);

    label.addEventListener("mouseout", function() {
      domainText.style.textDecoration = "";
    }, false);
  });

  // Hook into the page proxy state to get url changes
  change(window, "SetPageProxyState", function(orig) {
    return function(state) {
      categoryBox.updateLook();

      // Strip off wyciwyg and passwords
      let uri = getURI();
      try {
        uri = window.XULBrowserWindow._uriFixup.createExposableURI(uri);
      }
      catch(ex) {}

      // Break the url down into differently-styled parts
      let url = window.losslessDecodeURI(uri);
      if (url == "about:blank")
        return;

      let match = url.match(/^([^:]*:\/*)([^\/]*)(.*)$/);
      let urlParts = match == null ? ["", "", url] : match.slice(1);

      preDomain.setAttribute("value", urlParts[0]);
      domainText.setAttribute("value", urlParts[1]);
      postDomain.setAttribute("value", urlParts[2]);

      // Let the identity box resize to determine how much we can show
      async(function() {
        // For now, just use the full width without dynamically sizing
        return;

        // Clear out any previous fixed width to let max-width work
        postDomain.style.width = "";

        // Set the max-width to crop the text
        let width = goCategory.boxObject.x - postDomain.boxObject.x;
        postDomain.style.maxWidth = Math.max(15, width - 5) + "px";

        // Explicitly set the label width so the containing box shrinks
        postDomain.style.width = postDomain.boxObject.width + 1 + "px";
      });

      return orig.call(this, state);
    };
  });

  let tabPanel = createNode("panel");
  document.getElementById("mainPopupSet").appendChild(tabPanel);

  tabPanel.setAttribute("noautofocus", true);

  tabPanel.style.MozWindowShadow = "none";

  // Change display when shift is pressed
  tabPanel.onKey = function(event) {
    if (event.keyCode != event.DOM_VK_SHIFT)
      return;

    // Update internal state and update the panel
    tabPanel.shifted = event.shiftKey;
    if (tabPanel.state == "open")
      tabPanel.showNextCategory();
  };

  // Open the panel showing what next category to tab to
  tabPanel.showNextCategory = function() {
    // Show the previous category if going backwards
    let {shifted, textTab} = tabPanel;
    let {next, prev} = categoryBox;
    if (shifted)
      next = prev;

    // Nothing to show if nothing is next
    if (next == null || next == goCategory) {
      tabPanel.hidePopup();
      return;
    }

    // Set the appropriate key to press
    textTab.setAttribute("value", (shifted ? "shift-" : "") + "tab");

    // Read out various state to specially highlight based on input
    let {category, defaultIndex, providers} = next.categoryData;
    let {selectionStart, value} = hdInput;
    let shortValue = value.slice(0, selectionStart);
    let {length} = shortValue;

    // Track various parts of the text to split in the panel
    let splitParts = {
      preUnder: "search for ",
      underText: "",
      postUnder: "",
    }

    // Figure out if there needs to be a split-word underline
    if (shortValue == category.slice(0, length)) {
      splitParts.underText = shortValue;
      splitParts.postUnder = category.slice(length);
    }
    else
      splitParts.postUnder = category;

    // Figure out if the tab panel should be shown or not
    let dontShow = false;
    if (splitParts.underText == "") {
      if (shifted)
        dontShow = usage.tabPrev >= 3 || usage.tabNext >= 9;
      else
        dontShow = usage.tabNext >= 3;
    }
    else if (usage.tabComplete >= 3)
      dontShow = true;

    if (dontShow) {
      tabPanel.hidePopup();
      return;
    }

    // Slightly change the wording for the search category
    if (next == searchCategory) {
      splitParts.preUnder = "";
      splitParts.postUnder += " the web";
    }

    // Set the words in the corresponding parts
    for (let [part, text] in Iterator(splitParts))
      tabPanel[part].setAttribute("value", text);

    // Update the provider information
    let {icon, name} = providers[defaultIndex];
    tabPanel.icon.setAttribute("src", icon);
    tabPanel.provider.setAttribute("value", name);

    // Show the panel just above the input near the cursor
    tabPanel.openPopup(iconBox, "before_start");
  };

  // Add an event listener to show or hide completePanel popup
  listen(window, gURLBar.parentNode, "keypress", function() {
    if (categoryBox.complete != null && categoryBox.complete != goCategory)
      completePanel.showCompletedCategory();
    else 
      completePanel.collapsed = true;
  }, false);
  
  // Open the panel showing what next category to tab to
  completePanel.showCompletedCategory = function() {
    let {textTab} = completePanel;
    let {complete} = categoryBox;

    if (complete != null && complete != goCategory) {
      categoryBox.collapsed = true;
      tabPanel.hidePopup();
    }
    else {
      categoryBox.collapsed = !displayCategoryBox();
      completePanel.collapsed = true;
      return;
    }

    // Set the appropriate key to press
    textTab.setAttribute("value", "Tab");

    // Read out various state to specially highlight based on input
    let {category, defaultIndex, providers} = complete.categoryData;
    let {selectionStart, value} = hdInput;
    let shortValue = value.slice(0, selectionStart);
    let {length} = shortValue;

    // Track various parts of the text to split in the panel
    let splitParts = {
      preUnder: "search for ",
      postUnder: "",
    }

    splitParts.postUnder = category;

    // Slightly change the wording for the search category
    if (complete == searchCategory) {
      splitParts.preUnder = "";
      splitParts.postUnder += " the web";
    }

    // Set the words in the corresponding parts
    for (let [part, text] in Iterator(splitParts))
      completePanel[part].setAttribute("value", text);

    // Update the provider information
    if (completingIndex == null)
      completingIndex = defaultIndex;
    let {name} = providers[completingIndex];
    completePanel.provider.setAttribute("value", name);

    // Show the panel just above the input near the cursor
    completePanel.collapsed = false;

    let display = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
    display.setAttribute("src", complete.categoryData.providers[completingIndex].icon);
    let color;

    async( function() {
      color = getDominantColor(display);
      function rgb(a) "rgba(" + color + "," + a +")";
      let gradient = ["top left", "farthest-corner", rgb(.2), rgb(.4)];

      completePanel.provider.style.backgroundImage = "-moz-radial-gradient(" + gradient + ")";
    });

    async( function() {
      categoryBox.collapsed = !displayCategoryBox();
      completePanel.collapsed = true;
      }, 10000);
  };

  // Maybe update the panel if the shift key is held
  hdInput.addEventListener("keydown", tabPanel.onKey, true);
  hdInput.addEventListener("keyup", tabPanel.onKey, true);

  // Dynamically set noautohide to avoid bug 545265
  tabPanel.addEventListener("popupshowing", function runOnce() {
    tabPanel.removeEventListener("popupshowing", runOnce, false);
    tabPanel.setAttribute("noautohide", true);
  }, false);

  unload(function() {
    tabPanel.parentNode.removeChild(tabPanel);
  });

  unload(function() {
    completePanel.parentNode.removeChild(completePanel);
  });

  // Create a local scope for various tabPanel specific nodes
  {
    let tabBox = createNode("hbox");
    tabPanel.appendChild(tabBox);

    tabBox.setAttribute("align", "center");

    tabBox.style.backgroundColor = "white";
    tabBox.style.border = "1px solid rgb(50, 50, 50)";
    tabBox.style.borderRadius = "5px";
    tabBox.style.padding = "2px";

    let textPress = createNode("label");
    tabBox.appendChild(textPress);

    textPress.setAttribute("value", "Press");

    textPress.style.color = "#999";
    textPress.style.margin = "0 3px 0 0";

    let textTab = createNode("label");
    tabPanel.textTab = textTab;
    tabBox.appendChild(textTab);

    textTab.style.backgroundImage = "-moz-linear-gradient(top, rgb(240, 240, 240), rgb(220, 220, 220))";
    textTab.style.borderRadius = "2px";
    textTab.style.margin = "0";
    textTab.style.padding = "0 2px";

    let textTo = createNode("label");
    tabBox.appendChild(textTo);

    textTo.setAttribute("value", "to ");

    textTo.style.color = "#999";
    textTo.style.margin = "0 0 0 3px";

    let preUnder = createNode("label");
    tabPanel.preUnder = preUnder;
    tabBox.appendChild(preUnder);

    preUnder.style.color = "#999";
    preUnder.style.margin = "0";

    let underText = createNode("label");
    tabPanel.underText = underText;
    tabBox.appendChild(underText);

    underText.style.color = "#0c0";
    underText.style.fontWeight = "bold";
    underText.style.margin = "0";
    underText.style.textDecoration = "underline";

    let postUnder = createNode("label");
    tabPanel.postUnder = postUnder;
    tabBox.appendChild(postUnder);

    postUnder.style.color = "#999";
    postUnder.style.margin = "0";

    let textColon = createNode("label");
    tabBox.appendChild(textColon);

    textColon.setAttribute("value", ":");

    textColon.style.color = "#999";
    textColon.style.margin = "0 3px 0 0";

    let icon = createNode("image");
    tabPanel.icon = icon;
    tabBox.appendChild(icon);

    icon.setAttribute("height", 12);
    icon.setAttribute("width", 12);

    icon.style.filter = "url(#HDdesaturate)";

    let provider = createNode("label");
    tabPanel.provider = provider;
    tabBox.appendChild(provider);

    provider.style.color = "#999";
    provider.style.margin = "0 0 0 3px";

    let bottomBox = document.getElementById("browser-bottombox");
    let svgNode = bottomBox.nextSibling;
    const SVG = "http://www.w3.org/2000/svg";

    // Linux doesn't have a svg container, so create one.. permanently
    if (svgNode == null) {
      svgNode = document.createElementNS(SVG, "svg");
      svgNode.setAttribute("height", 0);
      bottomBox.parentNode.appendChild(svgNode);
    }

    let filter = document.createElementNS(SVG, "filter");
    svgNode.appendChild(filter);

    filter.id = "HDdesaturate";

    let matrix = document.createElementNS(SVG, "feColorMatrix");
    filter.appendChild(matrix);

    matrix.setAttribute("values", "0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0");

    unload(function() {
      filter.parentNode.removeChild(filter);
    });
  }
  // Create a local scope for Complete Category popup panel
  {
    let tabBox = createNode("hbox");
    completePanel.appendChild(tabBox);

    tabBox.setAttribute("align", "center");
    tabBox.setAttribute("style", "border:solid 1px; -moz-border-left-colors:rgba(50,50,50,0.5);" 
      + "-moz-border-bottom-colors:rgba(50,50,50,0); -moz-border-right-colors:rgba(50,50,50,0);"
      + "-moz-border-top-colors:rgba(50,50,50,0);margin-top:-2px;");
    tabBox.style.backgroundColor = "rgba(255,255,255,0)";
    tabBox.style.margin = "-2px 0px";
    tabBox.style.overflow = "hidden";

    let textPress = createNode("label");
    tabBox.appendChild(textPress);

    textPress.setAttribute("value", "Press");
    textPress.style.color = "#999";
    textPress.style.margin = "0 3px 0 3px";

    let textTab = createNode("label");
    completePanel.textTab = textTab;
    tabBox.appendChild(textTab);

    textTab.style.backgroundImage = "-moz-linear-gradient(top, rgb(240, 240, 240), rgb(220, 220, 220))";
    textTab.style.borderRadius = "2px";
    textTab.style.margin = "0";
    textTab.style.padding = "0 2px";

    let textTo = createNode("label");
    tabBox.appendChild(textTo);

    textTo.setAttribute("value", "to ");

    textTo.style.color = "#999";
    textTo.style.margin = "0 0 0 3px";

    let preUnder = createNode("label");
    completePanel.preUnder = preUnder;
    tabBox.appendChild(preUnder);

    preUnder.style.color = "#999";
    preUnder.style.margin = "0";

    let postUnder = createNode("label");
    completePanel.postUnder = postUnder;
    tabBox.appendChild(postUnder);

    postUnder.style.color = "#555";
    postUnder.style.margin = "0";

    let textAt = createNode("label");
    tabBox.appendChild(textAt);

    textAt.setAttribute("value", "at");

    textAt.style.color = "#999";
    textAt.style.margin = "0 3px";

    let provider = createNode("label");
    completePanel.provider = provider;
    tabBox.appendChild(provider);

    provider.style.color = "#666";
    provider.style.borderRadius = "3px";
    provider.style.padding = "0 2px";
  }

  // Catch various existing browser commands to redirect to the dashboard
  let commandSet = document.getElementById("mainCommandSet");
  let commandWatcher = function(event) {
    // Figure out if it's a command we're stealing
    switch (event.target.id) {
      case "Browser:OpenLocation":
        // For power users, allow getting the current tab's location when empty
        if (hdInput.value == "") {
          let url = getURI().spec;

          // Fill in the url and make sure to hide categories
          if (url != "about:blank") {
            hdInput.value = url;
            categoryBox.processInput();
          }
        }

        hdInput.focus();
        hdInput.select();
        break;

      case "Tools:Search":
        categoryBox.activate(searchCategory);
        break;

      // Not something we care about, so nothing to do!
      default:
        return;
    }

    // Prevent the original command from triggering
    event.stopPropagation();
  };
  commandSet.addEventListener("command", commandWatcher, true);
  unload(function() {
    commandSet.removeEventListener("command", commandWatcher, true);
  }, window);

  // Always make the star visible to prevent text shifting
  let star = document.getElementById("star-button");
  star.setAttribute("style", "visibility: visible;");
  unload(function() {
    star.removeAttribute("style");
  });

  // Remove the search bar when loading
  change(document.getElementById("search-container"), "hidden", true);

  // Make sure the identity box is visible
  unload(function() {
    origIdentity.collapsed = false;
  });

  // Disable the add-on when customizing
  listen(window, window, "beforecustomization", function() {
    // NB: Disabling will unload listeners, so manually add and remove below
    gAddon.userDisabled = true;

    // Listen for one customization finish to re-enable the addon
    window.addEventListener("aftercustomization", function reenable() {
      window.removeEventListener("aftercustomization", reenable, false);
      gAddon.userDisabled = false;
    }, false);
  });

  // Get the current browser's URI even if loading
  function getURI() {
    let channel = gBrowser.selectedBrowser.webNavigation.documentChannel;
    if (channel != null)
      return channel.originalURI;

    // Just return the finished loading uri
    return gBrowser.selectedBrowser.currentURI;
  }

  // Check for inactiveness
  function isInactive() {
    return gURLBar.mozMatchesSelector(":-moz-window-inactive");
  }

  // Allow sending of events for Test Pilot
  function sendEvent(type, data) {
    let evt = document.createEvent("Events");
    evt.initEvent("ABHD", true, false);
    gBrowser.ABHDevent = {
      data: data,
      type: type,
    };
    gBrowser.dispatchEvent(evt);
  }

  // Prepare the category box for first action!
  categoryBox.reset();

  // Trigger the UI to initialize for the current tab (for showing the url)
  window.URLBarSetURI();
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  gAddon = addon;

  // Load various javascript includes for helper functions
  ["helper", "providers", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Load in the provider data from preferences
  try {
    allProviders = JSON.parse(prefs.get("providers"));

    // Check for outdated data as a proxy to versions for now
    if (allProviders[8].providers[0].url == "http://twitter.com/search?q={search+terms}")
      throw "need to update 1";

    // Make sure we initialize to icons or text
    if (allProviders[0].showIcon == null)
      throw "need to update 2";

    // Make sure we initialize to hidden categories or not
    if (allProviders[0].hidden == null)
      throw "need to update 3";
  }
  catch(ex) {
    // Restore provider data with hardcoded defaults
    let categories = {};
    allProviders = [];
    PROVIDER_DATA.forEach(function([category, name, url, icon]) {
      // Add a new category and initialize with the current item
      let providers = categories[category];
      if (providers == null) {
        providers = categories[category] = [];
        allProviders.push({
          category: category,
          defaultIndex: 0,
          hidden: false,
          keyword: category == "go" ? "" : category + ": ",
          providers: providers,
          showIcon: false,
          text: category == "go" ? "Go to a website" : category == "search" ? "search the web" : category,
        });
      }

      // Save information about this provider for the category
      providers.push({
        icon: icon,
        name: name,
        url: url,
      });
    });

    // Specially configure the new data for testpilot
    let showIcon = false;
    let onlySearch = false;
    switch (prefs.get("testpilot")) {
      // Show all as text
      case 0:
        break;

      // Show all as icons
      case 1:
        showIcon = true;
        break;

      // Show just search as text
      case 2:
        onlySearch = true;
        break;

      // Show just search as icon
      case 3:
        showIcon = true;
        onlySearch = true;
        break;
    }

    // Apply the configuration
    allProviders.forEach(function(categoryData) {
      // Set hidden to true if we need to hide all but search
      categoryData.hidden = onlySearch && categoryData.category != "search";

      // Set the desired icon or text state
      categoryData.showIcon = showIcon;
    });
  }

  // Load in previous usage data
  try {
    usage = JSON.parse(prefs.get("usage"));
  }
  catch(ex) {
    usage = {};
  }

  // Make sure we have some initial values if necessary
  ["activate",
   "activateAndGo",
   "activateAndWent",
   "clickCategory",
   "clickProvider",
   "emptyClick",
   "providerSwitch",
   "tabComplete",
   "tabNext",
   "tabPrev",
  ].forEach(function(name) {
    if (usage[name] == null)
      usage[name] = 0;
  });

  // Combine location and search!
  watchWindows(addAwesomeBarHD);
})


/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();

  // Persist data across restarts and disables
  prefs.set("providers", JSON.stringify(allProviders));
  prefs.set("usage", JSON.stringify(usage));
}

/**
 * Handle the add-on being installed
 */
function install(data, reason) {}

/**
 * Handle the add-on being uninstalled
 */
function uninstall(data, reason) {
  // Clear out any persisted data when the user gets rid of the add-on
  if (reason == ADDON_UNINSTALL)
    prefs.resetBranch("");
}
