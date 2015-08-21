/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function BookmarkSearch(collectedTags, collectedHosts, excludedPlaces, utils, central) {
  let me = this;
  me.utils = utils;
  me.idfMap = {};
  me.tfMap = {};
  me.ranks = {}
  me.central = central;
  me.collectedTags = collectedTags;
  me.excludedPlaces = excludedPlaces;
  let tagRow = me.utils.getData(["rowid"], {"root_name": "tags"}, "moz_bookmarks_roots");
  if (tagRow.length == 0) {
    return;
  }
  me.rowid = tagRow[0]["rowid"];
  me.N = me.utils.getDataQuery("SELECT COUNT(1) as n FROM moz_bookmarks WHERE parent = :rowid", {
    "rowid" : me.rowid
  }, ["n"])[0]["n"];
  if (me.N == 0) {
    return;
  }
  me.createIDFMap();
  me.searchQuery();
}

BookmarkSearch.prototype.createIDFMap = function() {
  let me = this;
  for (let tag in me.collectedTags) {
    let n = me.utils.getDataQuery("SELECT COUNT(1) as n FROM " +
      "(SELECT * FROM moz_bookmarks WHERE parent= :rowid AND title= :tag) s " +
      "JOIN moz_bookmarks b on s.id = b.parent", {
        "rowid" : me.rowid,
        "tag": tag,
      }, ["n"])[0]["n"];
    me.idfMap[tag] = Math.log((me.N - n + 0.5)/(n + 0.5));
    me.tfMap[tag] = 1;
  }
}

BookmarkSearch.prototype.searchQuery = function() {
  let me = this;
  let condition = [];
  let i = 0;
  let params = {};
  for (let tag in me.collectedTags) {
    condition.push("title = :tag" + i);
    params["tag" + i] = tag;
    i++;
  }

  /* no tags to search for */
  if (condition.length == 0) {
    return;
  }
  condition = condition.join(' OR ');
  params["rowid"] = me.rowid;
  let query = "SELECT p.id as id, p.title as title,  p.url as url, " +
    "p.frecency as frecency, p.rev_host as rev_host, " +
    "GROUP_CONCAT(tag) as tags, COUNT(1) as matches FROM " +
    "(SELECT t.title as tag, b.fk as place_id FROM " +
    "(SELECT * FROM moz_bookmarks WHERE parent = :rowid AND (" + condition + ")) t JOIN " +
    "(SELECT * FROM moz_bookmarks WHERE type=1) b ON b.parent=t.id) r JOIN " +
    "moz_places p ON p.id=r.place_id GROUP BY p.id ORDER BY matches DESC, frecency DESC LIMIT 10"
  /*
  let query = "SELECT p.id as id, h.title as tag, p.url as url, p.title as title, " +
    "p.rev_host as rev_host, p.frecency as frecency FROM (SELECT b.fk, t.title FROM " +
    "(SELECT * FROM moz_bookmarks WHERE parent= :rowid AND (" + condition + ")) t " +
    "JOIN moz_bookmarks b ON b.parent = t.id) h JOIN moz_places p ON p.id = h.fk LIMIT 10;"
  */
  reportError("BMSEARCH");
  me.ranks = {};
  let result = me.utils.getDataQuery(query, params, ["id", "tags", "url", "title", "frecency", "rev_host"]);
  reportError(result.length);
  result.forEach(function({id, tags, url, title, frecency, rev_host}) {
    if (!(id in me.ranks)) {
      let score = tags.split(',').map(function(tag) {
        return me.idfMap[tag];
      }).reduce(function (a,b) {
        return a+b;
      });
      me.ranks[id] = {
        "score": score,
        "frecency": frecency,
        "bookmarked": true,
        "hub": central.isHub(id),
        "tags": tags.split(','),
        "title": title,
        "url": url,
        "revHost": rev_host,
      }
    } else {
      me.ranks[id]["tags"].push(tag)
      me.ranks[id]["score"] += me.idfMap[tag];
    }
  });
}

BookmarkSearch.prototype.getResults = function() {
  let me = this;
  return me.ranks;
};
