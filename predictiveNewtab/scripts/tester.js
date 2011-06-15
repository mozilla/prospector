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
 * The Original Code is Predictive Newtab.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Abhinav Sharma <asharma@mozilla.com>
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



function Tester() {
  let me = this;
  if (!TESTER) {
    return;
  }
  reportError("starting tester");
  me.GrandCentralTest();
}

Tester.prototype.GrandCentralTest = function() {
  let urlMap = {
    "moc.elgoog.www" : [
      {"id": 1, "visit_count" : 300, "url": "http://www.google.com/"},
      {"id": 2, "visit_count" : 210, "url": "http://www.google.com/reader/" },
      {"id": 3, "visit_count" : 10 , "url": "http://www.google.com/reader/23"},
      {"id": 4, "visit_count" : 15 , "url": "http://www.google.com/reader/22"},
      {"id": 5, "visit_count" : 2  , "url": "http://www.google.com/?s=bing"},
    ],

    "moc.koobecaf.www" : [
      {"id": 6, "visit_count" : 300, "url": "http://www.facebook.com/"},
      {"id": 7, "visit_count" : 100, "url": "http://www.facebook.com/home.php"},
      {"id": 8, "visit_count" : 60, "url": "http://www.facebook.com/photos.php"},
      {"id": 9, "visit_count" : 5, "url": "http://www.facebook.com/photos.php?p=23"},
      {"id":10, "visit_count" : 10, "url": "http://www.facebook.com/photos.php?p=44"},
    ],
  };

  let avgMap = {
    "moc.elgoog.www" : 1.3,
    "moc.koobecaf.www" : 1.2,
  }

  let central = new GrandCentral(urlMap, avgMap);
  for (let i = 1; i <= 10; i++) {
    reportError(i + " | " + central.isCentral(i))
  }
};

