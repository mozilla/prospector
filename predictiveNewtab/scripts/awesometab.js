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



/**
 * Creates an AwesomeTab instance for one tab.
 *
 * @constructor
 * @this {AwesomeTab}
 * @param {Element} doc the document to populate with results.
 * @param {Obect} utils an instance of the utilities class
 * @param {Object} central a GrandCentral instance
 * @param {Object} tagger an instance of the POSTagger
 */
function AwesomeTab(doc, utils, central, tagger, annoID) {
  let me = this;
  //me.tester = new Tester();
  try {
  me.utils = utils;
  me.pos = new POSTagger();
  reportError("getting visible places");
  let d = new Date();
  let t1 = d.getTime();
  let visiblePlaces = me.getVisiblePlaces();
  let currentPlaces = me.getLastKVisiblePlaces(visiblePlaces, 3);
  
  /*
  if (currentPlaces.length > 0) {
    let revHost = visiblePlaces[currentPlaces[0]]["rev_host"];
    let suggestions = global.linkJumper.getDestinationHosts(revHost);
    reportError("SUGGESTED HOSTS" + J(suggestions));
  }
  */

  let t2 = d.getTime();
  let collector = new TagCollector(currentPlaces,visiblePlaces, me.utils, tagger);
  let collectedTags = collector.getResults();
  let collectedHosts = collector.getHosts();
  let t3 = d.getTime();
  let searcher1 = new BookmarkSearch(collectedTags, collectedHosts, visiblePlaces, me.utils, central);
  let rankedResults1 = searcher1.getResults();
  let t4 = d.getTime();
  let searcher2 = new AllSearch(collectedTags, collectedHosts, visiblePlaces, me.utils, central);
  let rankedResults2 = searcher2.getResults();
  let t5 = d.getTime();
  reportError("showing results");

  let mixer = new Mixer(searcher1.getResults(), searcher2.getResults(), me.collectedTitles, collectedHosts ,me.utils);

  let disp = new Display(mixer.getMixed(), doc, me.utils, annoID);
  //builder.show();
  let t6 = d.getTime();

  reportError("getting visible places: " + (t1));
  reportError("collecting tags: " + (t2));
  reportError("bookmark searcher: " + (t4 - t3));
  reportError("all searcher: " + (t5 - t4));
  reportError("display: " + (t6 - t5));
  } catch (ex) { reportError(ex) }
}


/**
 * @usage
 */
AwesomeTab.prototype.getLastKVisiblePlaces = function(visiblePlaces, k) {
  let me = this;
  let condition = Object.keys(visiblePlaces).map(function(placeId) {
    return "place_id=" + placeId;
  }).join(" OR ");
  let sqlQuery = "SELECT place_id FROM moz_historyvisits WHERE " + condition +" GROUP BY "
    +"place_id ORDER BY id DESC LIMIT " + k;
  let params = {}
  let data =  me.utils.getDataQuery(sqlQuery, params, ["place_id"])
  let lastKPlaces = [];
  reportError("ACTIVE" + global.lastURL);
  for (let i = 0; i < data.length; i++) {
    let placeId = data[i]["place_id"];
    reportError("USING ACTIVE TAB" + useActive);
    if (visiblePlaces[placeId]["url"] == global.lastURL && useActive) {
      reportError("LAST URL WAS" + global.lastURL + placeId)
      lastKPlaces.unshift(placeId);
    }
    lastKPlaces.push(placeId);
  }
  reportError(lastKPlaces);
  return lastKPlaces;
};


AwesomeTab.prototype.getVisiblePlaces = function() {
  let me = this;
  let gBrowser = Services.wm.getMostRecentWindow("navigator:browser").gBrowser;
  let visibleTabs = gBrowser.visibleTabs;
  let places = {};
  me.collectedTitles = {};
  for (let i = 0; i < visibleTabs.length; i++) {
    let tab = visibleTabs[i];
    if (tab.pinned) {
      continue;
    }
    let uri = gBrowser.getBrowserForTab(tab).currentURI.spec;
    // reportError(uri);
    let placesData = me.utils.getData(["id", "title", "url", "rev_host", "frecency"], {
        "url": uri
      }, "moz_places")
    for (let j = 0; j < placesData.length; j++) {
      let place = placesData[j];
      places[place["id"]] = place;
      me.collectedTitles[place["title"]] = placesData[j]["title"];
    }
  }
  return places;
}
