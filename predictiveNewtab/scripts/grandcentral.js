/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function SiteCentral() {
  let me = this;
  me.utils = new AwesomeTabUtils();
  me.re_bad_substrings = new RegExp(/(\/post\/|\/article\/)/g);
  me.re_is_num = new RegExp(/\/[0-9]+\/{0,1}$/);
  me.re_bad_param = new RegExp(/^([a-z]|search)=/);
}

SiteCentral.prototype.isHub = function(placeId) {
  let me = this;
  let data = me.utils.getData(["url"], {"id":placeId},"moz_places");
  if (data.length == 0 || !data[0]["url"]) {
    return false;
  } else {
    return me.isURLHub(data[0]["url"]);
  }
}

/*
 * some heuristics, goal is to reject something very unlikely
 * to be a hub quickly.
 */
SiteCentral.prototype.isURLHub = function(url) {
  let me = this;
  if (!url) {
    return false;
  }
  url = url.split('?');
  if (url.length > 1) {
    if (me.re_bad_param.test(url[1])){
      return false;
    }
  }

  if (RE_HOME_URL.test(url)) {
    return true;
  }

  url = url[0];
  let splitURL = url.split('/');


  /* Quick reject */
  if (url.length > 80) { // very unlikely to be a hub
    reportError(url + "TOO LONG");
    return false
  }

  if (RE_FAIL_URL.test(url)) {
    return false;
  }

  let r1 = url.match(/[0-9]+/g);
  if (r1 && !r1.reduce(function(p,c,i,a) {
        return (p && (c.length < 6))
      }, true)) {
    reportError(url + "more than 8 consecutive digits");
    return false; // if after removing slash, more than 8 consec digits
  }
  if (splitURL.length > 7) {
    reportError(url + "has too many slashes");
    return false; // craziest i've seen is https://www.amazon.com/gp/dmusic/mp3/player
  }

  if (!splitURL.reduce(function(p,c){
        return (p && c.length < 40 && c.split(/[\-\_]/g).length < 3);
      }, true)) {
    reportError(url + "has component over 40 chars");
    return false;
  }
  return true;
}

SiteCentral.prototype.hubMapForHosts = function(hosts) {
  let me = this;
  let sqlQuery = "SELECT id, visit_count FROM (SELECT AVG(visit_count) " +
    "as a FROM moz_places WHERE :condition) avg INNER JOIN " +
    "(SELECT * FROM moz_places WHERE :condition) " +
    "p ON p.visit_count > 5 * avg.a";
  let params = {
    condition : hosts.map(function(s) { return "rev_host = " + s}).join(' OR '),
  }
  me.hubMap = {};
  me.utils.getDataQuery(sqlQuery, params, ["id"]).forEach(function({id, visit_count}) {
    me.hubMap[id] = visit_count;
  });
  reportError(JSON.stringify(me.hubMap));
}

SiteCentral.prototype.isHubFromMap = function(placeId) {
  let me = this;
  return (placeId in me.hubMap);
}

function SessionCentral() {
  let me = this;
}

/*
 * urlMap is assumed to have a {rev_host -> url structure;}
 */
function GrandCentral(searchResults, utils) {
  let me = this;
  me.utils = utils;
  me.trieMap = {};
  me.placeMap = {};
  me.hostMap = {};
  me.nodeMap = {};
  me.resMap = {};

  let uMap = {};
  me.pMap = {};
  for (let placeId in searchResults) {
    let revHost = searchResults[placeId]["revHost"];
    reportError(revHost);
    if (!(revHost in uMap)) {
      let query = "SELECT id, visit_count, url FROM moz_places WHERE rev_host = :revHost " +
        "ORDER BY frecency DESC LIMIT 15";
      uMap[revHost] = me.utils.getDataQuery(query, {
        "revHost" : revHost}, ["id","visit_count","url"]);

      uMap[revHost].forEach(function({id, visit_count, url}) {
        me.pMap[id] = true;
      });
    }
  }

  for (let revHost in uMap) {
    me.trieMap[revHost] = new URLTrie(uMap[revHost], revHost, me);
    reportError(me.trieMap[revHost]);
    me.trieMap[revHost].processTrie();
  }
  /*
  for (let placeId in me.nodeMap) {
    reportError(placeId + "||" + me.nodeMap[placeId].h);
  }
  */
}

GrandCentral.prototype.isCentral = function(placeId) {
  let me = this;
  if (!(placeId in me.pMap)) {
    return false;
  }
  return me.nodeMap[placeId].h;
};

function URLTrie(urls, revHost,  central) {
  let me = this;
  me.splitMap = {};
  me.central = central;
  me.revHost = revHost;
  me.trie = {
    "v" : 0,
    "c" : {},
  };
  me.nodeList = [];

  for (let i = 0; i < urls.length; i++) {
    central.placeMap[urls[i]["id"]] = urls[i]["url"];
    central.hostMap[urls[i]["id"]] = revHost;
    me.addURL(urls[i]["url"], urls[i]["visit_count"], urls[i]["id"]);
  }
  me.processTrie();
}

URLTrie.prototype.addURL = function(url, visitCount, placeId) {
  let me = this;
  let split = url.split(/(https{0,1}:\/\/)|(\/)|(\/{0,1}#\/{0,1})/)
    .slice(4).filter(function (s) {
      return (s && !(/^\/|#/).test(s));
    });
  let current = me.trie;
  me.splitMap[url] = split;
  let len = split.length;
  for (let i = 0; i < len; i++) {
    let str = split[i];
    if (!current.c) {
      continue;
    }
    if (str in current.c) {
      current = current.c[str];
    } else {
      current.c[str] = {
        "v" : (i == len - 1 ? visitCount : 0),
        "c" : {},
        "p" : current,
      };
      current = current.c[str];
      me.nodeList.push(current);
    }
  }
  me.central.nodeMap[placeId] = current;
}

/*
 * Algorithm to process the trie and determine which nodes are hubs.
 */
URLTrie.prototype.processTrie = function() {
  let me = this;
  let current = me.trie.c;

  function hubbleBubble(node) {
    let children = node.c, total = 0, n = 0;
    let hasChildren = false;
    for (let child in node.c) {
      hasChildren = true;
      total += node.c[child].v;
      n += 1;
    }
    if (hasChildren && 2*(total/n) < node.v) {
      node.h = true;
    } else if (!hasChildren && Object.keys(node.p.c).length > 1) {
      node.h = false;
      let t = 0, n = 0;
      for (let child in node.p.c) {
        t += node.p.c[child].v;
        n += 1;
      }
      node.h = node.v > 2*(t/n) ? true : false;

    } else {
      node.h = false;
    }
  }
  reportError(me.nodeList.length);
  for (let i = 0; i < me.nodeList.length; i++) {
    hubbleBubble(me.nodeList[i]);
  }

};

URLTrie.prototype.isHub = function(url) {
  let me = this;
  let split = me.splitMap[url];
  let current = me.trie;
  let is = false;
  let current = me.trie.c;

  /* traverse trie to evaluted node and pick up if its a host */
  for (let i = 0; i < split.length; i++) {
    if (split[i] in current) {
      is = current[split[i]]["h"];
      current = current[split[i]]["c"];
    }
  }
  return is;
}

URLTrie.prototype.toString = function() {
  let me = this;
  let current = me.trie;
  let d = "";

  function createString(node, spacing) {
    for (let child in node.c) {
      d += spacing + child + "|"+ node.c[child].h + "|" +node.c[child].v + "\n";
      if (Object.keys(node.c[child].c).length > 0) {
        createString(node.c[child], spacing + "\t");
      }
    }
  }

  createString(me.trie, "\t")
  return d;
}
