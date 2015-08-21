/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Thumbnailer() {
  this.annoID = this.createDB();
}

Thumbnailer.prototype.getAnnoID = function() {
  return this.annoID;
}

Thumbnailer.prototype.getThumbnail = function(win, doc) {
  let canvas = doc.createElement("canvas"); // where?
  canvas.setAttribute('width', '140');
  canvas.setAttribute('height', '100');
  let aspectRatio = canvas.width / canvas.height;
  let w = win.innerWidth + win.scrollMaxX;
  let h = Math.max(win.innerHeight, w / aspectRatio);
  if (w > 10000) {
    w = 10000;
  }
  if (h > 10000) {
    h = 10000;
  }

  let canvasW = canvas.width;
  let canvasH = canvas.height;
  let ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.save();

  let scale = canvasH / h;
  ctx.scale(scale, scale);
  ctx.drawWindow(win, 0, 0, w, h, "rgb(255,255,255)");
  ctx.restore();
  let img = canvas.toDataURL("image/png", "");
  return img;
}

Thumbnailer.prototype.createDB = function() {
  let me = this;
  let result = spinQuery (PlacesUtils.history.DBConnection, {
    query: "SELECT id FROM moz_anno_attributes WHERE name = :name",
    names: ["id"],
    params: {
      "name" : "labmonkey/thumbnail",
    }
  });

  if (result.length > 0) {
    return result[0]["id"];
  }

  spinQuery(PlacesUtils.history.DBConnection, {
    query: "INSERT INTO moz_anno_attributes (name) VALUES (:val)",
    params: {
      "val" : "labmonkey/thumbnail"
    },
    names: [],
  });

  result = spinQuery(PlacesUtils.history.DBConnection, {
    query: "SELECT id FROM moz_anno_attributes WHERE name = :name",
    params: {
      "name": "labmonkey/thumbnail",
    },
    names: ["id"],

  });
  if (result.length > 0) {
    return result[0]["id"];
  } else {
    return null;
  }

}


Thumbnailer.prototype.handlePageLoad = function(e) {
  reportError("handling page load");
  let me = this;
  let doc = e.originalTarget;
  let win = doc.defaultView;
  let url = doc.location.href;
  reportError(url);
  try {
  var thumb = me.getThumbnail(win, doc);
  } catch (ex) {
    /* thumbnail generation failed, do nothing */
    return;
  }

  let place = spinQuery(PlacesUtils.history.DBConnection, {
    query: "SELECT * FROM moz_places WHERE url = :url",
    params: {"url" : url},
    names: ["id"],
  });
  if (place.length == 0) {
    return;
  }
  let placeId = place[0]["id"];

  let d = new Date().getTime();
  let existing = spinQuery(PlacesUtils.history.DBConnection, {
    query: "SELECT * FROM moz_annos WHERE place_id = :placeId AND anno_attribute_id = :annoID",
    params: {
      "placeId" : placeId,
      "annoID" : me.annoID,
    },
    names: ["id", "lastModified"],
  });

  if (existing.length == 0) {
    /* not thumbnailed, do it now */
    spinQuery(PlacesUtils.history.DBConnection, {
      query: "INSERT INTO moz_annos (place_id, anno_attribute_id, content, dateAdded, lastModified, expiration) " +
        "VALUES (:placeId, :annoID, :content, :dateAdded, :lastModified, 4)",
      params : {
        "placeId" : placeId,
        "annoID" : me.annoID,
        "content": thumb,
        "dateAdded": d,
        "lastModified": d,
      },
      names: [],
    });
  } else {
    let lastModified = existing[0]["lastModified"];
    if (d - lastModified > (1000 * 60 * 60 * 24)) {// one day
      spinQuery(PlacesUtils.history.DBConnection, {
        query: "UPDATE moz_annos SET content=:content, lastModified=:d WHERE id = :id",
        params : {
          "content" : thumb,
          "lastModified": d,
          "id": exisiting[0]["id"],
        },
        names: [],
      });
    }
  }
}
