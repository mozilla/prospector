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
