/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Searcher(collectedTags, collectedHosts, excludedPlaces, utils) {
  let me = this;
  me.utils = utils;
  me.central = new SiteCentral();
  me.collectedHosts = collectedHosts;
  me.numHosts = collectedHosts.length;
  me.collectedTags = collectedTags;
  me.excludedPlaces = excludedPlaces;
  me.N = me.utils.getData(["id"], {"type":1}, "moz_bookmarks").length;
  me.placesMap = me.getPlaces(me.collectedTags);

}

Searcher.prototype.getPlaces = function(collectedTags) {
  let me = this;
  let places = {};
  me.idfMap = {};
  for (let tag in collectedTags) {
    let tagInfo = collectedTags[tag];
    let p = tagInfo["hosts"].length / me.numHosts;
    let placesWithTag = me.utils.getPlacesFromTag(tag);
    let n = placesWithTag.length;
    me.idfMap[tag] = Math.log((me.N - n + 0.5)/(n + 0.5));
    placesWithTag.forEach(function(placeId) {
      if (placeId in me.excludedPlaces) {
        return;
      }
      if (!(placeId in places)) {
        places[placeId] = {
          "tags"  : [[tag, tagInfo["bookmarked"], p, me.idfMap[tag]]],
          "isHub" : me.central.isHub(placeId),
          "isBookmarked" : me.utils.isBookmarked(placeId),
        };
      } else {
        let resDict = places[placeId];
        reportError("resdict is " + resDict);
        resDict.tags.push([tag, tagInfo["bookmarked"], p, me.idfMap[tag]]);
        places[placeId] = resDict;
      }
    });
  }
  return places;
};

Searcher.prototype.getResults = function() {
  let me = this;
  reportError(JSON.stringify(me.placesMap));
  return me.placesMap;
}
