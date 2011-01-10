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

// Get a favicon for a tab
function getTabIcon(tab) {
  // Use the favicon from the tab if it's there
  let src = tab.getAttribute("image");
  if (src != "")
    return src;

  // Use the default tab favicon
  return images["defaultFavicon.png"];
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

// Get a upper-case-first-of-word string from an array of strings
function upperFirst(strArray) {
  return strArray.map(function(part) {
    return part.slice(0, 1).toUpperCase() + part.slice(1);
  }).join(" ");
}
