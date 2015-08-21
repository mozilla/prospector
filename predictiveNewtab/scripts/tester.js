/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

