/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function AllSearch(collectedTags, collectedHosts, excludedPlaces, utils, central) {
  let me = this;
  me.utils = utils;
  me.excludedPlaces = excludedPlaces;
  me.N = me.utils.getDataQuery("SELECT COUNT(1) as N FROM moz_places;",
    {}, ["N"])[0]["N"];
  me.collectedTags = collectedTags;
  me.MIN_VISIT_COUNT = 5;
  me.MAX_PLACES = 1000;
  me.idfMap = {};
  me.tfMap = {};
  me.central = central;
  me.createIDFMap();
  me.searchQuery();
}

AllSearch.prototype.createIDFMap = function() {
  let me = this;
  for (let tag in me.collectedTags) {
    let n = me.utils.getDataQuery("SELECT COUNT(1) as n FROM moz_places" +
      " WHERE title LIKE :tag", {
        "tag" : "%" + tag + "%"
      }, ["n"])[0]["n"];
    me.idfMap[tag] = Math.log((me.N - n + 0.5)/(n + 0.5));
    me.tfMap[tag] = me.collectedTags[tag]["hosts"].length;
    reportError("done with idf map" + JSON.stringify(me.idfMap) + JSON.stringify(me.tfMap));
  }
}


/*
 * The problem with using the proper Okapi formula is that everything has a slightly different
 * score and the secondary sort by frecency becomes useless but this is not what we want.
 *
 * The problem is due to doclen, not because of tf. Plus, good websites have terrible titles
 * and there's not much that can be done about it.
 *
 * Another point about not looking in the title string for the tf is that that makes it
 * really easy to game the system and have a really high score by multiple instances.
 * Collecting tf across different hosts helps normalize that to some extent.
 */
AllSearch.prototype.searchQuery = function() {
  let me = this;
  let iS = ["id", "url", "title", "frecency", "visit_count", "rev_host"];
  let i = 0;
  let mS = [], kS = [], tS = [];
  let params = {};
  let allTags = {};
  let hasTag = false;
  let baseTable = "(SELECT id,url,title,rev_host,visit_count,date('now') as now, " +
    "frecency, date(last_visit_date/(1000000), 'unixepoch', 'localtime') as date " +
    "FROM moz_places WHERE title is not null AND url LIKE 'http%' " +
    "AND now - date < 30 ORDER BY frecency DESC LIMIT 500) p"
  for (let tag in me.collectedTags) {
    hasTag = true;
    mS.push("(title LIKE :stra" + i + " AND title LIKE :strb"+i+") as v" + i);
    kS.push(":idf" + i + " * " +
      "((3 * :tf"+i+") / (2 + :tf"+i+")) * "+ // Okapi without doclen normalization
      "(title LIKE :stra" + i + " AND title LIKE :strb" + i +")");
    tS.push("v"+i);
    allTags["v"+i] = tag;
    params["stra"+i] = "% " + tag + "%";
    params["strb"+i] = "%" + tag + " %";
    params["idf"+i] = me.idfMap[tag] ;
    params["tf"+i] = me.tfMap[tag];
    i++;
  }
  if (!hasTag) {
    return;
  }
  iSelect = iS.concat(mS).join(',') + "," + kS.join('+') + " as score";
  let iCond = "visit_count > 2 AND length(title) > 0 AND score > 0";
  let query = "SELECT " + iSelect + " FROM " + baseTable + " WHERE " + iCond + " ORDER BY score DESC LIMIT 15";
  try {
  var result = me.utils.getDataQuery(query, params, iS.concat(tS).concat(["score"]));
  } catch (ex) { reportError(JSON.stringify(ex)) };
  me.ranks = {};
  result.forEach(function(data) {
    if (data.id in me.excludedPlaces) {
      return;
    }
    let tags = [];
    tS.forEach(function(i) {
      if (data[i] == 1) tags.push(allTags[i]);
    });
    me.ranks[data.id] = {
      "score": data.score,
      "frecency": data.frecency,
      "bookmarked": me.utils.isBookmarked(data.id),
      "hub": true, // this is later fixed through Grand Central
      "tags": tags,
      "title": data.title,
      "url": data.url,
      "revHost" : data.rev_host,
    }
  });
  reportError(JSON.stringify(me.ranks));
}

AllSearch.prototype.getResults = function() {
  let me = this;
  return me.ranks;
}
