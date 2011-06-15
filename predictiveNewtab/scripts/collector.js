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



function TagCollector(lastKPlaces, currentPlaces, utils, pos) {
  let me = this;
  reportError("incoming open uri: " + JSON.stringify(currentPlaces));
  me.currentPlaces = currentPlaces;
  me.lastKPlaces = lastKPlaces;
  me.utils = utils;
  me.pos = pos;
  me.allHosts = {};
  me.taggingSvc = Cc["@mozilla.org/browser/tagging-service;1"]
                  .getService(Ci.nsITaggingService);
  me.newURI = Cc["@mozilla.org/network/io-service;1"]
              .getService(Ci.nsIIOService).newURI;

}

TagCollector.prototype.collectIncremental = function() {
  let me = this;
  let tagMap = {};

  /* merges tags from a new place into ones collected so far if required */
  function mergeBuffer(tB) {
    reportError("merging: " + J(tagMap) + J(tB));
    for (let tag in tB) {
      if (tag in tagMap) {
        let newHost = tB[tag]["hosts"][0];
        let hosts = tagMap[tag]["hosts"];
        let bookmarked = tagMap[tag]["bookmarked"];
        let count = tagMap[tag]["count"];
        tagMap[tag] = {
          "hosts": (hosts.indexOf(newHost) < 0 ? [hosts.push(newHost), hosts][1]: hosts),
          "bookmarked": bookmarked || tB[tag]["bookmarked"],
          "count" : count + tB[tag]["count"],
        }
      } else {
        tagMap[tag] = tB[tag];
      }
    }
  }

  let i = 0;

  for (let placeId in me.currentPlaces) {
    let host = me.currentPlaces[placeId]["rev_host"];
    me.allHosts[host] = true;
  }
  reportError(me.lastKPlaces.length);
  for (let p = 0; p < me.lastKPlaces.length; p++) {
    let placeId = me.lastKPlaces[p];
    let breakNow = !(i == 0); // make an exception for the first place
    let url = me.currentPlaces[placeId]["url"];
    let revHost = me.currentPlaces[placeId]["rev_host"];
    let tagBuffer = {};
    let titleTags = me.filterPOS(me.getTitleTags(placeId));
    let bookmarkTags = me.getTagsFromPlace(placeId);
    reportError(placeId + url);
    if (!me.utils.isValidURL(url)) {
      continue;
    }
    reportError(J(bookmarkTags));

    for (let i = 0; bookmarkTags && i < bookmarkTags.length; i++) {
      let tag = bookmarkTags[i];
      reportError("BM TAG: " + tag);
      if (tag in tagMap) {
        breakNow = false;
      }
      tagBuffer[tag] = {
        "hosts": [revHost],
        "bookmarked": true,
        "count": 1,
      };
    }

    for (let i = 0; titleTags && i < titleTags.length; i++) {
      let tag = titleTags[i];
      reportError("TITLE TAG: " + tag);
      if (tag in tagMap) {
        breakNow = false;
      }

      if (tag in tagBuffer) {
        tagBuffer[tag]["count"] += 1;
      } else {
        tagBuffer[tag] = {
          "hosts": [revHost],
          "bookmarked" : false,
          "count": 1,
        };
      }
    }

    if (breakNow) {
        break;
    } else {
      i++;
      mergeBuffer(tagBuffer);
    }

  }

  return tagMap;
};

TagCollector.prototype.getResults = function() {
  let me = this;
  let result = me.collectIncremental();
  reportError(J(result));
  return result;
  /*
  let clusterMap = me.clusterByHost();
  let collectedTags = me.collectTags(clusterMap);
  reportError(JSON.stringify(collectedTags));
  return collectedTags;
  */
}

TagCollector.prototype.getHosts = function() {
  let me = this;
  return me.allHosts;
}

/* returns { rev_host -> [placeId] } map */
TagCollector.prototype.clusterByHost = function() {
  let me = this;
  let resultMap = {};
  me.allHosts = [];
  reportError(JSON.stringify(me.currentPlaces));
  for (let placeId in me.currentPlaces) {
    let revHost = me.currentPlaces[placeId]["rev_host"];
    if (revHost.length < 3) {
      continue;
    }
    if (!(revHost in resultMap)) {
      me.allHosts.push(revHost);
      resultMap[revHost] = [placeId];
    } else {
      resultMap[revHost].push(placeId);
    }
  }
  reportError("returing clustered map: " + JSON.stringify(resultMap));
  return resultMap;
};

/*
 * Type 1:  tag from bookmark tag
 * Type 2: tag from title
 * TOD: use POS tagger here.
 */
TagCollector.prototype.rejectTag = function(tag) {
  return (tag in STOPWORDS);
}

TagCollector.prototype.filterPOS = function(tags) {
  let me = this;
  let tagged = me.pos.tag(tags);
  let filtered = [];
  for (let i = 0; i < tagged.length; i++) {
    if(RE_NOUN_VERB.test(tagged[i][1]) && !(tagged[i][0] in STOPWORDS)) {
      filtered.push(tagged[i][0]);
    }
  }
  return filtered;
}

TagCollector.prototype.collectTags = function(clusterMap) {
  let me = this;
  let allTags = {};
  for (let revHost in clusterMap) {
    let places = clusterMap[revHost];
    for (let p = 0; p < places.length; p++) {
      let placeId = places[p];
      let titleTags = me.getTitleTags(placeId);
      let bookmarkTags = me.getTagsFromPlace(placeId);
      reportError(J(titleTags) + J(bookmarkTags));
      if (bookmarkTags)
        reportError(J(me.pos.tag(bookmarkTags)));
      if (titleTags)
        reportError(J(me.pos.tag(titleTags)));

      if (bookmarkTags && bookmarkTags.length > 0) {
        bookmarkTags = me.filterPOS(bookmarkTags);
        for (let i = 0; i < bookmarkTags.length; i++) {
          let bmTag = bookmarkTags[i];
          if (me.rejectTag(bmTag, 1)) {
            reportError("CONTINUE");
            continue;
          }
          if (!(bmTag in allTags)) {
            allTags[bmTag] = {
              "hosts": [revHost],
              "bookmarked": true,
            }
          } else {
            let resDict = allTags[bmTag];
            reportError(JSON.stringify(resDict["hosts"]));
            if (resDict["hosts"].indexOf(revHost) < 0) {
              resDict["hosts"].push(revHost);
            }
            resDict["bookmarked"] = true;
            allTags[bmTag] = resDict;
          }
        }
      } else {
        if (titleTags && titleTags.length > 0) {
          titleTags = me.filterPOS(titleTags);
          for (let i = 0; i < titleTags.length; i++) {
            let titleTag = titleTags[i];
            if (me.rejectTag(titleTag, 2)) {
              reportError("CONTINUE");
              continue;
            }
            if (!(titleTag in allTags)) {
              allTags[titleTag] = {
                "hosts": [revHost],
                "bookmarked": false,
              }
            } else {
              let resDict = allTags[titleTag];
              if (resDict["hosts"].indexOf(revHost) < 0) {
                resDict["hosts"].push(revHost);
              }
              allTags[titleTag] = resDict;
            }
          }
        }
      }
    }
  }
  reportError("ALL TAGS: " + J(allTags));
  return allTags;
}

/*
 * returns list of tags for a given placeId
 */
TagCollector.prototype.getTitleTags = function(placeId) {
  let me = this;
  let title = me.currentPlaces[placeId]["title"];
  return title.toLowerCase().replace(/[\|\_]/).match(/[a-z]+/g);
}

TagCollector.prototype.getTagsFromPlace = function(placeId) {
  let me = this;
  function getPlaceInfo(pid) {
    let result = me.utils.getData(["url", "title"],{"id": pid},"moz_places");
    return result.length > 0 ? {"url": result[0]["url"], "title":result[0]["title"]} : null;
  }
  let placeInfo = getPlaceInfo(placeId);
  if (!placeInfo || !placeInfo["title"] || !placeInfo["url"])
    return;

  let taggingSvc = Cc["@mozilla.org/browser/tagging-service;1"]
                   .getService(Ci.nsITaggingService);
  let uri = me.newURI(placeInfo["url"], null, null);
  let tags = me.taggingSvc.getTagsForURI(uri);
  if (!tags || tags.length == 0) {
    return null;
  }
  return tags;
}

