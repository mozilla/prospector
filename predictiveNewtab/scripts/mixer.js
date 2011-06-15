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




function Mixer(bmSearch, allSearch, collectedTitles, collectedHosts, utils) {
  let me = this;

  let includedTitles = {};
  let includedPlaces = {};
  let placeArr = [];

  reportError(J(bmSearch));
  reportError(J(allSearch));

  try {
  var allCentral = new GrandCentral(allSearch, utils);
  //var bmCentral = new GrandCentral(bmSearch, utils);
  } catch (ex) {reportError(ex)}
  for (let placeId in bmSearch) {
    if (bmSearch["frecency"] < 100) {
      continue;
    }
    //bmSearch[placeId].hub = bmCentral.isCentral(placeId);
    let url = bmSearch[placeId]["url"];
    let placeTitle = bmSearch[placeId]["title"];
    let revHost = bmSearch[placeId]["revHost"];
    let bmTitle = utils.getBookmarkTitleFromURL(url);
    bmTitle = bmTitle ? bmTitle : placeTitle;
    if (placeId in includedPlaces ||
        bmTitle in includedTitles ||
        bmTitle in collectedTitles ||
        placeTitle in includedTitles ||
        //revHost in collectedHosts ||
        placeTitle in collectedTitles) {
      continue;
    }
    includedTitles[bmTitle] = 1;
    includedTitles[placeTitle] = 1;
    includedPlaces[placeId] = 1;
    let result = bmSearch[placeId];
    result["bmEngine"] = 1;
    result["title" ] = bmTitle;
    result["id"] = placeId;
    reportError(J(result));
    placeArr.push(result);
  }

  for (let placeId in allSearch) {
    if (allSearch["frecency"] < 100) {
      continue;
    }
    allSearch[placeId].hub = allCentral.isCentral(placeId);
    let url = allSearch[placeId]["url"];
    let placeTitle = allSearch[placeId]["title"];
    let revHost = allSearch[placeId]["revHost"];
    if (placeId in includedPlaces ||
        //revHost in collectedHosts ||
        placeTitle in includedTitles ||
        placeTitle in collectedTitles) {
      continue;
    }
    includedTitles[placeTitle] = 1;
    includedPlaces[placeId] = 1;
    let result = allSearch[placeId];
    result["bmEngine"] = 0;
    result["id"] = placeId;
    reportError(J(result));
    placeArr.push(result);


  }

  reportError(J(placeArr));

  placeArr.sort(function (p1, p2) {
    /* prioritize results from the bookmark search engine */

    let bmDiff = p2["bmEngine"] - p1["bmEngine"];
    if (bmDiff != 0) {
      return bmDiff;
    }

    if (p1.bookmarked && !p2.bookmarked) {
      return -1;
    } else if (!p1.bookmarked && p2.bookmarked) {
      return 1;
    }

    /* given that they are same engine, use scoring */
    let scoreDiff = p2["score"] - p1["score"];
    if (scoreDiff != 0) {
      return scoreDiff;
    }

    /* finally, use frecency*/
    let frecencyDiff = p2["frecency"] - p1["frecency"];
    if (frecencyDiff != 0) {
      return frecencyDiff;
    }
    return 0;
  });

  reportError(J(placeArr));

  me.places = placeArr;
}

Mixer.prototype.getMixed = function() {
  reportError(J(this.places));
  return this.places;
}
