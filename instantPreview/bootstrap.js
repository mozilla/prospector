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
 * The Original Code is Instant Preview.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *   Erik Vold <erikvvold@gmail.com>
 *   Greg Parris <greg.parris@gmail.com>
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

const {interfaces: Ci, utils: Cu} = Components;
const global = this;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

/**
 * Start showing a preview of the selected location bar suggestion
 */
function addPreviews(window) {
  let browser = window.gBrowser;
  let urlBar = window.gURLBar;
  let popup = urlBar.popup;
  let richBox = popup.richlistbox;

  // Shorten the results so that previews are visible
  let origRows = urlBar.getAttribute("maxrows");
  urlBar.setAttribute("maxrows", 3);
  unload(function() urlBar.setAttribute("maxrows", origRows), window);

  let preview;
  // Provide a way to get rid of the preview from the current tab
  function removePreview() {
    if (preview != null) {
      preview.parentNode.removeChild(preview);
      preview = null;
    }
  }

  // Provide a way to replace the current tab with the preview
  function persistPreview() {
    if (preview == null)
      return;

    // Mostly copied from tabbrowser.xml swapBrowsersAndCloseOther
    let selectedTab = browser.selectedTab;
    let selectedBrowser = selectedTab.linkedBrowser;
    selectedBrowser.stop();

    // Unhook our progress listener
    let selectedIndex = selectedTab._tPos;
    const filter = browser.mTabFilters[selectedIndex];
    let tabListener = browser.mTabListeners[selectedIndex];
    selectedBrowser.webProgress.removeProgressListener(filter);
    filter.removeProgressListener(tabListener);
    let tabListenerBlank = tabListener.mBlank;

    // Pick out the correct interface for before/after Firefox 4b8pre
    let openPage = browser.mBrowserHistory || browser._placesAutocomplete;

    // Restore current registered open URI.
    if (selectedBrowser.registeredOpenURI) {
      openPage.unregisterOpenPage(selectedBrowser.registeredOpenURI);
      delete selectedBrowser.registeredOpenURI;
    }
    openPage.registerOpenPage(preview.currentURI);
    selectedBrowser.registeredOpenURI = preview.currentURI;

    // Save the last history entry from the preview if it has loaded
    let history = preview.sessionHistory.QueryInterface(Ci.nsISHistoryInternal);
    let entry;
    if (history.count > 0) {
      entry = history.getEntryAtIndex(history.index, false);
      history.PurgeHistory(history.count);
    }

    // Copy over the history from the current tab if it's not empty
    let origHistory = selectedBrowser.sessionHistory;
    for (let i = 0; i <= origHistory.index; i++) {
      let origEntry = origHistory.getEntryAtIndex(i, false);
      if (origEntry.URI.spec != "about:blank")
        history.addEntry(origEntry, true);
    }

    // Add the last entry from the preview; in-progress preview will add itself
    if (entry != null)
      history.addEntry(entry, true);

    // Swap the docshells then fix up various properties
    selectedBrowser.swapDocShells(preview);
    selectedBrowser.attachFormFill();
    browser.setTabTitle(selectedTab);
    browser.updateCurrentBrowser(true);
    browser.useDefaultIcon(selectedTab);
    urlBar.value = (selectedBrowser.currentURI.spec != "about:blank") ?
        selectedBrowser.currentURI.spec : preview.getAttribute("src");

    // Restore the progress listener
    tabListener = browser.mTabProgressListener(selectedTab, selectedBrowser, tabListenerBlank);
    browser.mTabListeners[selectedIndex] = tabListener;
    filter.addProgressListener(tabListener, Ci.nsIWebProgress.NOTIFY_ALL);
    selectedBrowser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL);

    // Move focus out of the preview to the tab's browser before removing it
    preview.blur();
    selectedBrowser.focus();
    removePreview();
  }

  // Provide callbacks to stop checking the popup
  let stop = false;
  function stopIt() stop = true;
  unload(function() {
    stopIt();
    removePreview();
  }, window);

  // Keep checking if the popup has something to preview
  listen(window, popup, "popuphidden", stopIt);
  listen(window, popup, "popupshown", function() {
    // Only recursively go again for a repeating check if not stopping
    if (stop) {
      stop = false;
      return;
    }
    Utils.delay(arguments.callee, 100);

    // Short circuit if there's no suggestions but don't remove the preview
    if (!urlBar.popupOpen)
      return;

    // Make sure we have something selected to show
    let result = richBox.selectedItem;
    if (result == null) {
      removePreview();
      return;
    }

    // Only auto-load some types of uris
    let url = result.getAttribute("url");
    if (url.search(/^(data|ftp|https?):/) == -1) {
      removePreview();
      return;
    }

    // Create the preview if it's missing
    if (preview == null) {
      preview = window.document.createElement("browser");
      preview.setAttribute("type", "content");

      // Copy some inherit properties of normal tabbrowsers
      preview.setAttribute("autocompletepopup", browser.getAttribute("autocompletepopup"));
      preview.setAttribute("contextmenu", browser.getAttribute("contentcontextmenu"));
      preview.setAttribute("tooltip", browser.getAttribute("contenttooltip"));

      // Prevent title changes from showing during a preview
      preview.addEventListener("DOMTitleChanged", function(e) e.stopPropagation(), true);

      // The user clicking or tabbinb to the content should indicate persist
      preview.addEventListener("focus", persistPreview, true);
    }

    // Move the preview to the current tab if switched
    let selectedStack = browser.selectedBrowser.parentNode;
    if (selectedStack != preview.parentNode)
      selectedStack.appendChild(preview);

    // Load the url if new
    if (preview.getAttribute("src") != url)
      preview.setAttribute("src", url);
  });

  // Make the preview permanent on enter
  listen(window, urlBar, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_ENTER:
      case event.DOM_VK_RETURN:
        // Only use the preview if there aren't special key combinations
        if (event.shiftKey || event.ctrlKey || event.metaKey)
          removePreview();
        else
          persistPreview();
        break;

      // Remove the preview on cancel or edits
      case event.DOM_VK_CANCEL:
      case event.DOM_VK_ESCAPE:
      case event.DOM_VK_BACK_SPACE:
      case event.DOM_VK_DELETE:
      case event.DOM_VK_END:
      case event.DOM_VK_HOME:
      case event.DOM_VK_LEFT:
      case event.DOM_VK_RIGHT:
        removePreview();
        break;
    }
  });

  // Clicking a result will save the preview
  listen(window, popup, "click", persistPreview);
}

/**
 * Handle the add-on being activated on install/enable
 */
function startup(data, reason) AddonManager.getAddonByID(data.id, function(addon) {
  // Load various javascript includes for helper functions
  ["utils"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  Cu.import("resource://services-sync/util.js");
  watchWindows(addPreviews);
});

/**
 * Handle the add-on being deactivated on uninstall/disable
 */
function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

function install() {}
function uninstall() {}
