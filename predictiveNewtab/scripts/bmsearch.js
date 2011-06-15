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
