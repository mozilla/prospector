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
  this._backGroundElement = configObject.bElement;
  this._demographer = configObject.demographer;

  let div  = this._document.getElementById("newtab-vertical-margin");

  let iframe = this._document.createElementNS(XHTML_NS, "iframe");
  iframe.setAttribute("type", "content");
  iframe.style.left = "-1000px";
  iframe.style.top = "36px";
  iframe.style.width = "85%";
  iframe.style.height = "90%";
  iframe.style.position = "absolute";
  iframe.style.background = "white";

  iframe.style.boxShadow = "5px 5px 10px black";
  iframe.style.borderRadius = "10px 10px 10px 10px";

  // remove the border pixels
  iframe.style.borderWidth = "0px";
  iframe.style.borderLeftWidth = "0px";
  iframe.style.borderRightWidth = "0px";
  iframe.style.borderTopWidth = "0px";
  iframe.style.borderBottomWidth = "0px";

  // now that we have iframe, let's install apis into it
  let apiInjector = function(doc, topic, data) {
    try {
      // make sure that it's our iframe document that has been inserted into iframe
      if (!doc.defaultView || doc.defaultView != iframe.contentWindow) {
        return;  // so it was not
      }

      console.log("caught document insertion");
      Services.obs.removeObserver(apiInjector, 'document-element-inserted', false);

      iframe.contentWindow.wrappedJSObject.getCategories = function(callback) {
        callback(this._demographer.getInterests());
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
  div.parentNode.insertBefore(iframe, div.nextSibling)

  // move left to clientWidth
  iframe.style.left =  "-" + iframe.clientWidth + "px";
  this._iframe = iframe;
  this._shown = false;

  let self = this;
  iframe.onload = function(event) {
    iframe.contentWindow.addEventListener("click", function(event) {
      if (self._shown == false) {
        self.show();
      }
    });

    self.hide();
  };

  iframe.contentWindow.onresize = function(event) {
    self.resize();
  };
}

AppViewer.prototype = {
  show: function() {
    let baseWidth = this._backGroundElement.clientWidth;
    let leftExtent =(baseWidth - this._iframe.clientWidth) / 2;
    this._shown = true;
    this._iframe.style.MozTransitionProperty = "left";
    this._iframe.style.MozTransitionDuration = "1s";
    this._iframe.style.left = leftExtent + "px";
    this._backGroundElement.style.opacity = "0.5";
  },

  hide: function() {
    let leftExtent = this._iframe.clientWidth + 10;
    this._iframe.style.left = "-" + leftExtent + "px";

    this._window.setTimeout(function() {
      this._iframe.style.MozTransitionProperty = "";
      this._iframe.style.MozTransitionDuration = "";
      this._backGroundElement.style.opacity = "";
      this._shown = false;
    }.bind(this), 1000);
  },

  resize: function() {
    if (this._shown == true) {
      return;
    }

    let leftExtent = this._iframe.clientWidth - 40;
    this._iframe.style.left = "-" + leftExtent + "px";
  },

}

exports.AppViewer = AppViewer;
