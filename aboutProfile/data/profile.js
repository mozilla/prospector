/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

$(document).ready(function() {
  console.log("READY");

  self.port.emit("donedoc");
});

self.port.on("show_cats", function(cats, totalAcross) {
  console.log("GOT CATS " + cats);
  let catBukets = {};
  let catNames = [];
  let aliases = [];

  let cutOff = 0.01 * 1.0 * totalAcross;
  let fullPath = undefined;
  console.log("Cutoff " + cutOff);
  console.log("Fullpath " + fullPath);

  if (fullPath) {
    Object.keys(cats).forEach(function(cat) {
      let top = cat.replace(/\/.*/, "");
      let bucket = catBukets[top];
      if (!bucket) {
        bucket = {
          total: 0,
          cats: []
        };
        catBukets[top] = bucket;
      }
      bucket.total += cats[cat].vcount;
      bucket.cats.push(cat);
    });

    Object.keys(catBukets).sort(function(a, b) {
      return catBukets[b].total - catBukets[a].total;
    }).forEach(function(top) {
      console.log(top, JSON.stringify(catBukets[top].cats));
      catNames = catNames.concat(catBukets[top].cats.sort(function(a, b) {
        return cats[b].vcount - cats[a].vcount;
      }));
    });
  }
  else {
    Object.keys(cats).sort(function(a, b) {
      return cats[b].vcount - cats[a].vcount;
    }).forEach(function(name) {
      catNames.push(name);
    });
  }

  $("#cats").empty();
  let largest = null;
  let lastTop = "";
  for (x in catNames) {
    let name = catNames[x];
    let top = name.replace(/\/.*/, "");
    let catData = cats[name];

    if (catData.vcount < cutOff) {
      continue;
    }

    if (fullPath == null) {
      // remove the path prefix
      name = name.replace(/^.*\//, "");
    }

    let champs = catData.champs.items;
    if (!largest) {
      largest = catData.vcount;
    }
    let barWidth = Math.floor((200.00 * catData.vcount) / largest);
    if (barWidth < 5) {
      barWidth = 5;
    }
    let catNode = $("<cpan/>").addClass("cat").append(
      $("<span/>").addClass("label").text(name),
      $("<div/>").addClass("bar").text("_").css({
        "width": barWidth + "px"
      }),
      $("<span/>").addClass("bar_number").css({
        "font-size": "x-small"
      }).text(Math.round(catData.vcount)));

    if (top != lastTop && fullPath != null) {
      catNode.css({ "margin-top": "10px" });
      lastTop = top;
    }

    $("#cats").append(catNode);
    let explaneNode = $("<cpan/>").addClass("explain").hide();
    for (x in champs) {
      explaneNode.append($("<li/>").text(champs[x].item.domain + " " + Math.round(champs[x].item.vcount)));
    }
    $("#cats").append(explaneNode);
    catNode.click(function() {
      if (explaneNode.attr("shown") == "1") {
        explaneNode.hide();
        explaneNode.attr("shown", "0");
      }
      else {
        explaneNode.show();
        explaneNode.attr("shown", "1");
      }
    });
  }
});

function displayDemogs(demog, buketNames) {
  let min = 10000000000000;
  let max = -10000000000000;
  for (x in buketNames) {
    let bucket = buketNames[x];
    let bData = demog[bucket];
    if (min > bData.vtotal) min = bData.vtotal;
    if (max < bData.vtotal) max = bData.vtotal;
  }

  let dif = max - min;

  for (x in buketNames) {
    let bucket = buketNames[x];
    let lMargin = 0;
    let width = 100;
    let rMargin = 0;
    let color;
    let vtotal = demog[bucket].vtotal;

    let value = Math.floor((200.0 * vtotal) / dif);
    if (value < 0) {
      width = - value;
      if (width > 100) {
        width = 100;
      }
      lMargin = 100 - width;
      rMargin = 100;
      color = "blue";
    }
    else {
      if (value > 100) {
        value = 100;
      }
      width = value;
      rMargin = 100 - width;
      lMargin = 100;
      color = "olive";
    }

    let theNode = $("<cpan/>").addClass("demog").append(
      $("<span/>").addClass("dmog_label").text(bucket),
      $("<span/>").addClass("demog_bar").text("_").css({
        "width": width + "px",
        "margin-left": lMargin + "px",
        "margin-right": rMargin + "px",
        "background-color": color,
        "color": color
      }),
      $("<span/>").addClass("bar_number").css({
        "font-size": "x-small"
      }).text(Math.floor(vtotal)));
    $("#demogs").append(theNode)

    let explaneNode = $("<div/>").hide();
    let negNode = $("<ul/>").addClass("inliner");
    let champs = demog[bucket].neg.items;
    for (x in champs) {
      negNode.append($("<li/>").css({
        "color": "blue"
      }).text(champs[x].item.domain + " " + Math.round(champs[x].item.vcount) + " " + champs[x].item.drop));
    }
    explaneNode.append(negNode);

    let posNode = $("<ul/>").addClass("inliner");
    champs = demog[bucket].pos.items;
    for (x in champs) {
      negNode.append($("<li/>").css({
        "color": "olive"
      }).text(champs[x].item.domain + " " + Math.round(champs[x].item.vcount) + " " + champs[x].item.drop));
    }
    explaneNode.append(posNode);
    $("#demogs").append(explaneNode);

    theNode.click(function() {
      if (explaneNode.attr("shown") == "1") {
        explaneNode.hide();
        explaneNode.attr("shown", "0");
      }
      else {
        explaneNode.show();
        explaneNode.attr("shown", "1");
      }
    });
  }
}

self.port.on("show_demog", function(demog) {
  console.log("GOT DEMOG " + demog);

  $("#demogs").empty();
  displayDemogs(demog, ["male", "female"]);
  $("#demogs").append($("<br/>"));
  displayDemogs(demog, ["age_18", "age_25", "age_35", "age_45", "age_55", "age_65"]);
  $("#demogs").append($("<br/>"));
  displayDemogs(demog, ["no_college", "some_college", "college", "graduate"]);
  $("#demogs").append($("<br/>"));
  displayDemogs(demog, ["children", "no_children"]);
  $("#demogs").append($("<br/>"));
  displayDemogs(demog, ["home", "school", "work"]);
  $("#demogs").append($("<br/>"));
});
