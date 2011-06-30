const {Cu, Cm, Cc, Ci} = require("chrome");

function Utils() {
  let me = this;
  me.faviconSvc = Cc["@mozilla.org/browser/favicon-service;1"]
                  .getService(Ci.nsIFaviconService);
  me.ios = Cc["@mozilla.org/network/io-service;1"]
           .getService(Ci.nsIIOService);
  me.bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
             .getService(Ci.nsINavBookmarksService);
  me.FAVICON_CACHE = {};
  /* some useful regular expressions */
  me.re_tokenize = new RegExp(/[\s]/);
  me.re_hostname = new RegExp(/s/);
}

Utils.prototype.getFaviconData = function(url) {
  let me = this;
  try {
    let wrappedURL = me.ios.newURI(url, null, null);
    let faviconURL = me.faviconSvc.getFaviconForPage(wrappedURL);
    let dataURL = me.faviconSvc.getFaviconDataAsDataURL(faviconURL);
    return dataURL;
  } catch (ex) {
    return null;
  }
}

Utils.prototype.isBookmarked = function(url) {
  let me = this;
  try {
    let wrappedURL = me.ios.newURI(url, null, null);
    return me.bmsvc.isBookmarked(wrappedURL);
  } catch (ex) {
    reportError(ex);
    return false;
  }
}

exports.help = Utils;
