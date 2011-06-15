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
