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
 * The Original Code is Recall Monkey.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Abhinav Sharma <me@abhinavsharma.me>
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

console.log("this is content script with no privileges");
const reportError = console.log
let $ = document.getElementById
let C = document.createElement;
let J = JSON.stringify;

var currentID = -1;

function Dashboard() {
  let me = this;
  me.fluidLists = {
    "prioritized" : [],
    "excluded" : [],
  }
  me.skipped = 0;

  function handleSubmit (e) {
    reportError("handling submission 1/2");
    me.skipped = 0;
    e.preventDefault();
    me.handleSubmit(e);
  }

  function handleChangeSubmit(e) {
    me.handleSubmit(e);
  }
  
  me.maxScrolled = 0;
  function handleScroll(e) {
    if (window.scrollY == window.scrollMaxY) {
      me.incrementScroll();
    }
  }

  $('search-form').addEventListener("submit", handleSubmit, false);
  $('search-form').addEventListener("keyup", handleSubmit, false);
  $('time-form').addEventListener("click", handleChangeSubmit, false);
  $('prioritize-bookmarks').addEventListener("click", handleChangeSubmit, false);
  window.addEventListener("scroll", handleScroll, false);
}

Dashboard.prototype.incrementScroll = function() {
  let me = this;
  console.log("increment scroll");
  me.skipped += 50;
  me.handleSubmit(me.e, true)
}

Dashboard.prototype.handleSubmit = function(e, append) {
  try {
  let me = this;
  if (e) {
    me.e = e;
  } else if (me.e) {
    e = me.e;
  }

  let params = {
    "preferredHosts": me.fluidLists["prioritized"],
    "excludedHosts": me.fluidLists["excluded"],
    "limit": 50,
    "skip": me.skipped,
    "prioritizeBookmarks" : $('prioritize-bookmarks').checked,
  };

  let timeRange = 0;
  let elems = document.getElementsByName('timerange');

  for (let i = 0; i < elems.length; i++) {
    let elem = elems[i];
    if (elem.checked) {
      timeRange = parseInt(elem.value);
    }
  }
  reportError("TIME RANGE: " + timeRange);

  params['timeRange'] = timeRange;
  params['query'] = $('search-field').value;
  reportError(J(params));
  currentID = Math.floor(Math.random() * 16000);
  self.postMessage({
    "random" : currentID,
    "action" : "search",
    "params" : params,
    "append" : append ? true : false,
  });
  $('loading-image').style.visibility = "visible";
  } catch (ex) {console.log(ex) }
}

Dashboard.prototype.addPinned = function(revHost, listType) {
  console.log("adding pinned")
  try {
  let me = this;
  for (let list in me.fluidLists) {
    let i = me.fluidLists[list].indexOf(revHost);
    if (list != listType && i >= 0) {
      me.fluidLists[list].splice(i, 1);
      me.refreshPinned(list);
    }
  }
  let idx = me.fluidLists[listType].indexOf(revHost);
  reportError(revHost);
  reportError(idx);
  if (idx < 0) {
    me.fluidLists[listType].push(revHost);
  }
  console.log(listType);
  me.refreshPinned(listType);

  } catch (ex) { console.log(ex) }
};

Dashboard.prototype.removePinned = function(revHost, listType) {
  let me = this;
  let idx = me.fluidLists[listType].indexOf(revHost);
  reportError(idx);
  if (idx < 0) {
    return;
  }
  me.fluidLists[listType].splice(idx, 1);
  me.refreshPinned(listType);
}

Dashboard.prototype.refreshPinned = function(listType) {
  let me = this;

  function handleUnpinClick(e) {
    me.handleUnpinClick(e);
  }

  $(listType + '-list').innerHTML = "";
  me.fluidLists[listType].forEach(function(revHost) {
    let link = C('a')
    link.setAttribute('class', 'website');
    let webName = revHost.split('').reverse().join('').slice(1);
    link.innerHTML = 'X ' + webName;
    link.setAttribute('href', '#');
    link.setAttribute('value', listType);
    link.setAttribute('revHost', revHost);
    link.addEventListener("click", handleUnpinClick, false);
    let el = C('li');
    el.appendChild(link);
    $(listType + '-list').appendChild(el);
  });
  me.handleSubmit();
}

Dashboard.prototype.handleUnpinClick = function(e) {
  let me = this;
  e.preventDefault();
  let listType = e.target.getAttribute('value');
  let revHost = e.target.getAttribute('revHost');

  me.removePinned(revHost, listType);
}



Dashboard.prototype.populate = function(results, append) {
  $('loading-image').style.visibility = 'hidden';
  let me = this;
  if (!append)
    $('result-list').innerHTML = "";
  results.forEach(function ({title, tags, url, revHost, isBookmarked, faviconData}) {
    if (!title || !url) {
      return;
    }
    let li = C('li');
    let el = C('div');
    let link = C('a');
    let tagList = C('div');
    let blank1 = C('br');
    let blank2 = C('br');
    let blank3 = C('br');
    let website = C('span');
    let plus = C('a');
    let minus = C('a');

    function handlePlusClick(e) {
      console.log("handling plus click");
      me.handlePlusClick(e);
    }

    function handleMinusClick(e) {
      me.handleMinusClick(e);
    }

    let host = revHost.split('').reverse().join('').slice(1);
    website.setAttribute('class', 'website');
    website.innerHTML = host;
    
    plus.innerHTML = '(prioritize)';
    plus.setAttribute('class', 'website');
    plus.setAttribute('href', '#');
    plus.setAttribute('value', host);
    plus.addEventListener("click", handlePlusClick, false);
    minus.innerHTML = '(exclude)';
    minus.setAttribute('class', 'website');
    minus.setAttribute('href', '#');
    minus.setAttribute('value', host);
    minus.addEventListener("click", handleMinusClick, false);
    
    let upArrow = C('label');
    upArrow.setAttribute('class', (me.fluidLists["prioritized"].indexOf(revHost) < 0 ? 'arrow up inactive' : 'arrow up active'));
    upArrow.setAttribute('value', revHost);
    upArrow.addEventListener("click", handlePlusClick, false);
    let imageSpacer1 = C('br');
    let downArrow = C('label');
    downArrow.setAttribute('value', revHost);
    downArrow.setAttribute('class', 'arrow down')
    downArrow.addEventListener("click", handleMinusClick, false);
    let imageSpacer2 = C('br');

    let images = C('span')
    let favicon = C('img');
    let bookmarkI = C('img');
    favicon.setAttribute('src', faviconData ? faviconData : "chrome://mozapps/skin/places/defaultFavicon.png");
    favicon.setAttribute('class', 'favicon');
    bookmarkI.setAttribute('src', 'img/bookmark.png');
    bookmarkI.setAttribute('class', 'bookmarkI');
    let loc = C('span')
    loc.setAttribute('class', 'location');
    loc.innerHTML = url.slice(0,100);
    link.innerHTML = title.length > 70 ? title.slice(0,70) + " ..." : title;
    link.setAttribute('href', url);
    link.setAttribute('target', '_blank');
    el.setAttribute('class', 'result-info');
    el.appendChild(link);
    el.appendChild(bookmarkI);
    /*
    el.appendChild(blank1);
    el.appendChild(website);
    el.appendChild(plus);
    el.appendChild(minus);
    */
    el.appendChild(blank1);
    if (tags.length > 0) {
      tagList.innerHTML = "Tags: " + tags.join(', ');
      tagList.setAttribute('class', 'location');
      el.appendChild(tagList)
    }
//    el.appendChild(blank2);
    el.appendChild(loc);
    images.setAttribute('class', 'icon-bookmark')
    images.appendChild(upArrow);
//    images.appendChild(imageSpacer1);
//    images.appendChild(imageSpacer2);
    images.appendChild(downArrow);
    images.appendChild(favicon);
    bookmarkI.style.visibility = isBookmarked ? 'visible' : 'hidden';
    //images.appendChild(bookmarkI);
    li.appendChild(images)
    li.appendChild(el);
    $('result-list').appendChild(li);

  });
}

Dashboard.prototype.handlePlusClick = function(e) {
  let me = this;
  e.preventDefault();
  let revHost = e.target.getAttribute('value');
  me.addPinned(revHost, "prioritized");
}

Dashboard.prototype.handleMinusClick = function(e) {
  let me = this;
  e.preventDefault();
  let revHost = e.target.getAttribute('value');
  me.addPinned(revHost, "excluded");
}

var dash = new Dashboard();


self.on("message", function(data) {
  if (data.action == "display") {
    if (data.random == currentID) {
      dash.populate(data.results, data.append);
    }
  } else {

  }
  console.log("got message from chrome");
});

