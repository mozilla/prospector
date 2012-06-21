/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const {Cc,Ci,Cu} = require("chrome");
const simplePrefs = require("simple-prefs");

Cu.import("resource://gre/modules/Services.jsm", this);

const XHTML_NS = "http://www.w3.org/1999/xhtml";

function AppViewer(configObject) {
  this._window = configObject.window;
  this._document = configObject.document;
  this._parentElement = configObject.parentElement;
  this._demographer = configObject.demographer;

  let iframe = this._document.createElementNS(XHTML_NS, "iframe");
  iframe.setAttribute("type", "content");
  iframe.style.border = "0px";
  iframe.style.MozBoxFlex = "1";
  iframe.style.overflow = "hidden";

  // now that we have iframe, let's install apis into it
  let apiInjector = function(doc, topic, data) {
    try {
      // make sure that it's our iframe document that has been inserted into iframe
      if (!doc.defaultView || doc.defaultView != iframe.contentWindow) {
        return;  // so it was not
      }

      Services.obs.removeObserver(apiInjector, 'document-element-inserted', false);

      iframe.contentWindow.wrappedJSObject.getCategories = function(callback) {
        this._demographer.submitInterests(callback);
      }.bind(this);

      iframe.contentWindow.wrappedJSObject.getDemographics = function(callback) {
        callback({});
      }
    }
    catch(ex) {
      console.log("ERROR " + ex);
    }
  }.bind(this);

  Services.obs.addObserver(apiInjector, 'document-element-inserted', false);
  iframe.src = simplePrefs.prefs.apps_page_url;

  // insert doc into the thing
  this._parentElement.insertBefore(iframe , null)
  this._iframe = iframe;
}

exports.AppViewer = AppViewer;
