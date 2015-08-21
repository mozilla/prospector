/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function UserDisplay(results) {
  let me = this;
}

function DevDisplay() {

}



function Display(places, doc, utils, annoID) {
  let me = this;
  me.doc = doc;
  me.utils = utils;
  let $ = doc.getElementById;
  me.annoID = annoID;
  let type = null;


  if (SHOWNICE) {
    me.utils.getDataQuery(
      "SELECT p.title as title, p.url as url, a.content as image " +
      "FROM moz_places p JOIN moz_annos a ON p.id = a.place_id WHERE " +
      "a.anno_attribute_id = :annoID ORDER BY frecency DESC LIMIT 8", {
      "annoID" : me.annoID,
    }, ["title", "url", "image"]).forEach(function({title, url, image}) {
       me.addElement(title, url, image, "frequented");
    });

    let urlMap = {};
    let titleMap = {};
    let imageMap = {}
    var imageCond = places.map(function (p) {
      urlMap[p.id] = p.url;
      titleMap[p.id] = p.title;
      return "place_id = " + p.id
    } ).join(' OR ');
    me.utils.getDataQuery(
      "SELECT place_id, content FROM moz_annos WHERE anno_attribute_id = :annoID AND (" + imageCond + ")", {
        "annoID" : annoID,
      }, ["place_id", "content"]).forEach(function({place_id, content}) {
        imageMap[place_id] = content;
      });
    places = places.slice(0,8);

    let blankCanvas = me.doc.createElement("canvas");
    blankCanvas.setAttribute('width', '140');
    blankCanvas.setAttribute('height', '100');
    let blankURL = blankCanvas.toDataURL("image/png" ,"")

    for (let i = 0; i < places.length; i++) {
      let id = places[i]["id"];
      if (!places[i].hub) {
        continue;
      }
      me.addElement(titleMap[id], urlMap[id], ((id in imageMap) ? imageMap[id] : blankURL), "suggested");
    }
    return;
  }

  for (let i = 0; i < places.length; i++) {
    let place = places[i];
    reportError(J(place));
    let title = place.title,
        score = place.score,
        frecency = place.frecency,
        bookmarked = place.bookmarked,
        url = place.url,
        hub = place.hub,
        bmEngine = place.bmEngine,
        tags = place.tags;

    if (!title || !url) {
      continue;
    }

    if (hub) {
      $('bThT-table').style.display = "block";
      type = 'bThT';
    } else {
      $('bThF-table').style.display = "block";
      type = 'bThF';
    }

    let bmImg = doc.createElement('img');
    bmImg.style.height = '16px';
    bmImg.style.width = '16px';
    bmImg.src = 'img/star.png';
    bmImg.style.visibility = place["bookmarked"] ? 'visible' : 'hidden';

    let link = doc.createElement('a');
    link.setAttribute('href', url);

    link.innerHTML = title.slice(0,35);
    let urlText = doc.createElement('span');
    urlText.innerHTML = '(' + url.slice(0,33) + ')';

    let row = doc.createElement('tr');
    let cell = doc.createElement('td');
    cell.appendChild(link);
    cell.appendChild(doc.createElement('br'));
    cell.appendChild(urlText);
    let cell2 = doc.createElement('td');
    cell2.innerHTML = tags.join("<br />");
    let cell3 = doc.createElement('td');
    cell3.innerHTML = "Score: " + Math.round(score * 10000) / 10000 + "<br />" +
                      "Frecency: " + frecency + "<br />" +
                      "Hub: " + hub  + "<br />" +
                      "BM Engine: " + bmEngine;
    let cell4 = doc.createElement('td');
    cell4.appendChild(bmImg);

    row.appendChild(cell);
    row.appendChild(cell2);
    row.appendChild(cell3);
    row.appendChild(cell4);
    $(type).appendChild(row);
  }

  if (!type) {
    $('no-results').style.display = "block";
  }
}


Display.prototype.addElement = function(title, url, image, type) {
  let me = this;
  let $ = me.doc.getElementById;

  if (!me.utils.isValidURL(url)) {
    return;
  }

  let thumbContainer = me.doc.createElement('span');
  thumbContainer.setAttribute('class', 'thumb-container');

  let imageLink = me.doc.createElement('a');
  imageLink.setAttribute('href', url);
  let thumbnail = me.doc.createElement('img');
  thumbnail.setAttribute('class', 'thumbnail');
  thumbnail.setAttribute('src', image);
  imageLink.appendChild(thumbnail);

  let spanInfo = me.doc.createElement('span');
  spanInfo.setAttribute('class', 'thumb-info');
  let textLink = me.doc.createElement('a');
  textLink.innerHTML = title.length > 20 ? title.slice(0,18) + "..." : title;
  textLink.setAttribute('href', url);
  spanInfo.appendChild(textLink);

  thumbContainer.appendChild(imageLink);
  thumbContainer.appendChild(spanInfo);

  $(type).appendChild(thumbContainer);
}
