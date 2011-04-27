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
  iconBox.setAttribute("hidden", true);
  iconBox.setAttribute("id", "identity-box");
  origIdentity.parentNode.insertBefore(iconBox, origIdentity.nextSibling);

  unload(function() {
    iconBox.parentNode.removeChild(iconBox);
  });

  let providerIcon = createNode("image");
  providerIcon.setAttribute("id", "page-proxy-favicon");
  iconBox.appendChild(providerIcon);

  // Show providers at the icon if something is active
  providerIcon.addEventListener("mouseover", function() {
    let {active} = categoryBox;
    if (active == null)
      return;
    active.context.openAt(providerIcon);
  }, false);

  // Add stuff around the original urlbar input box
  let urlbarStack = createNode("stack");
  origInput.parentNode.insertBefore(urlbarStack, origInput.nextSibling);

  urlbarStack.setAttribute("flex", 1);

  unload(function() {
    urlbarStack.parentNode.removeChild(urlbarStack);
  });

  // Create a browser to prefetch search results
  let prefetcher = createNode("browser");
  prefetcher.setAttribute("autocompletepopup", gBrowser.getAttribute("autocompletepopup"));
  prefetcher.setAttribute("collapsed", true);
  prefetcher.setAttribute("contextmenu", gBrowser.getAttribute("contentcontextmenu"));
  prefetcher.setAttribute("tooltip", gBrowser.getAttribute("contenttooltip"));
  prefetcher.setAttribute("type", "content");
  gBrowser.appendChild(prefetcher);

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

  // Activate a category with an optional provider index
  categoryBox.activate = function(categoryLabel, index) {
    // Cycle through providers when re-activating the same category
    let {active} = categoryBox;
    if (active == categoryLabel && index == null) {
      let {defaultIndex, providers} = active.categoryData;
      index = (defaultIndex + 1) % providers.length;
    }
    else {
      // Keep track of the original text values
      let {selectionEnd, selectionStart, value} = hdInput;

      // Remove any active query terms when activating another
      let query = value;
      if (categoryBox.active != goCategory)
        query = query.replace(/^[^:]+:\s*/, "");

      // Update the text with the active keyword
      let {keyword} = categoryLabel.categoryData;
      let shortQuery = query.slice(0, selectionStart);
      if (keyword == "")
        hdInput.value = query;
      // Use the partially typed short keyword
      else if (selectionStart > 0 && shortQuery == keyword.slice(0, selectionStart))
        hdInput.value = shortQuery + ": " + query.slice(selectionStart);
      // Insert the full keyword
      else
        hdInput.value = keyword + query;

      // Move the cursor to its original position
      let newLen = hdInput.value.length;
      let origLen = value.length;
      hdInput.selectionStart = newLen + selectionStart - origLen;
      hdInput.selectionEnd = newLen + selectionEnd - origLen;
    }

    // Switch to a particular provider if necessary
    if (index != null)
      categoryLabel.categoryData.defaultIndex = index;

    // Update the autocomplete results now that we've activated
    categoryBox.processInput();
    gURLBar.mController.handleText();
    hdInput.focus();
  };

  // Look through the input to decide what category could be activated
  categoryBox.maybeHighlight = function() {
    categoryBox.highlight = null;

    // See if there's any potential categories to highlight
    let {selectionStart, value} = hdInput;
    let shortValue = value.slice(0, selectionStart);
    let {length} = shortValue;
    if (length > 0) {
      Array.some(categoryBox.childNodes, function(label) {
        let {categoryData} = label;
        if (categoryData == null)
          return;
        let {keyword} = categoryData;
        if (keyword == "")
          return;
        if (shortValue == keyword.slice(0, length)) {
          categoryBox.highlight = label;
          return true;
        }
      });
    }

    // Indicate that search can be activated if nothing else is
    if (categoryBox.active == goCategory && categoryBox.highlight == null)
      categoryBox.highlight = searchCategory;
  };

  // Figure out if the current input text is activating a category
  categoryBox.processInput = function() {
    // Figure out what's the active category based on the input
    let {value} = hdInput;
    let inputQuery = value;
    let inputParts = value.match(/^([^:]*):\s*(.*?)$/);
    categoryBox.active = goCategory;
    if (inputParts != null) {
      let inputKeyword = inputParts[1];
      Array.some(categoryBox.childNodes, function(label) {
        let {categoryData} = label;
        if (categoryData == null)
          return;
        let {keyword} = categoryData;
        if (keyword == "")
          return;
        if (inputKeyword == keyword.slice(0, inputKeyword.length)) {
          categoryBox.active = label;
          inputQuery = inputParts[2];
          return true;
        }
      });
    }

    // Update the UI now that we've figured out various states
    categoryBox.maybeHighlight();
    categoryBox.updateLook();

    // Convert the input into a url for the location bar
    let {active} = categoryBox;
    let {defaultIndex, providers} = active.categoryData;
    let url = providers[defaultIndex].url;
    const termRegex = /{search(.)terms}/;
    let spaceChar = url.match(termRegex)[1];
    url = url.replace(termRegex, inputQuery.replace(/ /g, spaceChar));
    gURLBar.value = url;

    // Prefetch the search results if not going to a page
    if (active != goCategory)
      prefetcher.loadURI(url)

    // Only show results for going to a history page
    gURLBar.popup.collapsed = active != goCategory;

    // Save the input value to restore later if necessary
    gBrowser.selectedTab.HDinput = value;
  };

  // Clear out various state of the current input
  categoryBox.reset = function() {
    categoryBox.active = null;
    categoryBox.highlight = null;
    categoryBox.hover = null;
    categoryBox.updateLook();
  };

  // Differently color certain categories depending on state
  categoryBox.updateLook = function() {
    // Restore some UI like the identity box
    let {active, highlight, hover} = categoryBox;
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

    // Go through each label and style it appropriately
    let doActive = gURLBar.hasAttribute("focused") || hdInput.value != "";
    Array.forEach(categoryBox.childNodes, function(label) {
      let color = "#999";
      if (label == active && doActive)
        color = "#090";
      else if (label == highlight && doActive || label == hover)
        color = "#00f";
      label.style.color = color;

      label.style.textDecoration = label == hover ? "underline" : "";
    });

    // Show the original identity box when inactive
    origIdentity.hidden = doActive;
    iconBox.hidden = !doActive;
  };

  // Pointing away removes the go category highlight
  categoryBox.addEventListener("mouseout", function(event) {
    if (event.target != categoryBox)
      return;
    if (gURLBar.hasAttribute("focused"))
      return;
    categoryBox.highlight = null;
    categoryBox.updateLook();
  }, false);

  // Indicate the default behavior of a click is go
  categoryBox.addEventListener("mouseover", function(event) {
    if (event.target != categoryBox)
      return;
    if (gURLBar.hasAttribute("focused"))
      return;
    categoryBox.highlight = goCategory;
    categoryBox.updateLook();
  }, false);

  // Select the text to edit for a website
  categoryBox.addEventListener("click", function(event) {
    if (event.target != categoryBox && event.target != goCategory)
      return;
    hdInput.focus();
    hdInput.select();
  }, false);

  // Helper to add a category or comma
  function addLabel(text) {
    let label = createNode("label");
    categoryBox.appendChild(label);

    label.setAttribute("value", text);
    label.style.margin = 0;

    return label;
  }

  // Create a category label
  function addCategory(categoryData) {
    let {category, keyword, providers, text} = categoryData;

    let label = addLabel(text);
    label.categoryData = categoryData;

    label.style.cursor = "pointer";

    // For context-less, activate on plain click
    label.addEventListener("click", function() {
      categoryBox.activate(label);
    }, false);

    // Handle the mouse moving in or out of the related labels
    function onMouse({type, relatedTarget}) {
      // Ignore events between the two related labels
      if (relatedTarget == label || relatedTarget == comma)
        return;

      let hovering = type == "mouseover";
      categoryBox.hover = hovering ? label : null;
      categoryBox.updateLook();

      // Show providers next to the label
      if (hovering)
        context.openAt(label);
    }

    label.addEventListener("mouseout", onMouse, false);
    label.addEventListener("mouseover", onMouse, false);

    // Add a comma after each category
    let comma = addLabel(", ");
    comma.addEventListener("mouseout", onMouse, false);
    comma.addEventListener("mouseover", onMouse, false);

    // Prepare a popup to show category providers
    let context = createNode("menupopup");
    label.context = context;
    document.getElementById("mainPopupSet").appendChild(context);

    // Add a menuitem that knows how to switch to the provider
    providers.forEach(function({icon, name}, index) {
      let provider = createNode("menuitem");
      provider.setAttribute("class", "menuitem-iconic");
      provider.setAttribute("image", icon);
      provider.setAttribute("label", name);
      context.appendChild(provider);

      provider.addEventListener("command", function() {
        categoryBox.activate(label, index);
      }, false);

      return provider;
    });

    // Allow opening the context under a node
    context.openAt = function(node) {
      if (context.state == "open")
        return;
      if (category == "go")
        return;

      context.updateChecked();
      context.openPopup(node, "after_start");
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
      categoryBox.processInput();
      categoryBox.updateLook();

      // Assume dismiss of the popup by clicking on the label is to activate
      // Windows sends both popuphiding and click events, so ignore this one
      if (!isWin && categoryBox.hover == label)
        categoryBox.activate(label);
    }, false);

    // Keep the category highlighted and prepare to dismiss
    context.addEventListener("popupshowing", function() {
      categoryBox.highlight = label;
      categoryBox.updateLook();

      // Automatically hide the popup when pointing away
      unOver = listen(window, window, "mouseover", function(event) {
        // Allow pointing at the category label
        switch (event.originalTarget) {
          case label:
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
    }, false);

    return label;
  }

  // Add each category to the UI and remember some special categories
  allProviders.forEach(addCategory);
  let goCategory = categoryBox.firstChild;
  let searchCategory = goCategory.nextSibling.nextSibling;
  categoryBox.removeChild(categoryBox.lastChild);

  // Copy most of the original input field
  let hdInput = origInput.cloneNode(false);
  urlbarStack.appendChild(hdInput);

  // Hide the original input
  change(origInput.style, "maxWidth", 0);
  change(origInput.style, "overflow", "hidden");

  hdInput.removeAttribute("onblur");
  hdInput.removeAttribute("onfocus");
  hdInput.removeAttribute("placeholder");

  hdInput.style.pointerEvents = "none";

  // Use white shadows to cover up the category text
  let (shadow = []) {
    for (let i = -10; i <= 30; i += 5)
      for (let j = -6; j <= 3; j += 3)
        shadow.push(i + "px " + j + "px 5px white");
    hdInput.style.textShadow = shadow.join(", ");
  }

  hdInput.addEventListener("blur", function() {
    let url = gBrowser.selectedBrowser.currentURI.spec;
    if (hdInput.value == url) {
      hdInput.value = "";
      categoryBox.processInput();
    }
    else
      categoryBox.updateLook();
  }, false);

  hdInput.addEventListener("focus", function() {
    gURLBar.setAttribute("focused", true);
    categoryBox.processInput();
  }, false);

  hdInput.addEventListener("input", function() {
    categoryBox.processInput();
  }, false);

  // Allow escaping out of the input
  hdInput.addEventListener("keydown", function(event) {
    if (event.keyCode != event.DOM_VK_ESCAPE)
      return;

    // Return focus to the browser if already empty
    if (hdInput.value == "")
      gBrowser.selectedBrowser.focus();
    // Empty out the input on first escape
    else {
      hdInput.value = "";
      categoryBox.processInput();
    }
  }, false);

  // Update what gets highlighted when moving the cursor
  hdInput.addEventListener("keyup", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_LEFT:
      case event.DOM_VK_RIGHT:
        categoryBox.maybeHighlight();
        categoryBox.updateLook();
        break;
    }
  }, false);

  // Detect tab switches to restore previous input
  listen(window, gBrowser.tabContainer, "TabSelect", function() {
    hdInput.value = gBrowser.selectedTab.HDinput || "";
    categoryBox.processInput();
  });

  // Allow tab completion to activate
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    if (event.keyCode != event.DOM_VK_TAB)
      return;

    // Let ctrl-tab do the usual tab switching
    if (event.ctrlKey)
      return;

    let {active, highlight} = categoryBox;
    if (active != goCategory)
      categoryBox.activate(active);
    else if (highlight != null)
      categoryBox.activate(highlight);

    event.preventDefault();
    event.stopPropagation();
  });

  // Activate the go category when dismissing the autocomplete results
  listen(window, gURLBar.popup, "popuphiding", function() {
    if (categoryBox.hover == goCategory)
      categoryBox.activate(goCategory);
  });

  // Redirect focus from the original input to the new one
  listen(window, origInput, "focus", function(event) {
    origInput.blur();
    hdInput.focus();
  }, false);

  // Hook into the user selecting a result
  change(gURLBar, "handleCommand", function(orig) {
    return function(event) {
      let isGo = categoryBox.active == goCategory;
      categoryBox.reset();

      // Just load the page into the current tab
      if (isGo)
        return orig.call(this, event);

      // Reuse the current tab if it's empty
      let targetTab = gBrowser.selectedTab;
      if (!window.isTabEmpty(targetTab))
        targetTab = gBrowser.addTab();

      prefetcher.persistTo(targetTab);
      gBrowser.selectedTab = targetTab;
    };
  });

  // Catch various existing browser commands to redirect to the dashboard
  let commandSet = document.getElementById("mainCommandSet");
  let commandWatcher = function(event) {
    // Figure out if it's a command we're stealing
    switch (event.target.id) {
      case "Browser:OpenLocation":
        // For power users, allow getting the current tab's location when empty
        if (hdInput.value == "") {
          let url = gBrowser.selectedBrowser.currentURI.spec;
          if (url != "about:blank")
            hdInput.value = url;
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
    origIdentity.hidden = false;
  });

  // Prepare the category box for first action!
  categoryBox.reset();
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup({id}) AddonManager.getAddonByID(id, function(addon) {
  // Load various javascript includes for helper functions
  ["helper", "providers", "utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  // Load in the provider data from preferences
  try {
    allProviders = JSON.parse(prefs.get("providers"));
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
          keyword: category == "go" ? "" : category + ": ",
          providers: providers,
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
  }

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
