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
  let aliases = [];

  // Figure out the count for each top level category
  let topLevel = {};
  Object.keys(cats).forEach(function(cat) {
    let top = cat.replace(/\/.*/, "");
    let {vcount} = cats[cat];
    topLevel[top] = (topLevel[top] || 0) + vcount;
  });

  let seriesColors = ["#aae", "#eaa", "#eea", "#aea", "#eae", "#aee", "#acf",
    "#fca", "#fac", "#ffc", "#cfa", "#afc", "#fcf", "#cff"];

  // Convert the data for the plotter and assign colors
  let sortedTops = [];
  let topColors = {};
  Object.keys(topLevel).sort(function(a, b) {
    return topLevel[b] - topLevel[a];
  }).forEach(function(top, pos) {
    sortedTops.push([top, topLevel[top]]);
    topColors[top] = seriesColors[pos];
  });

  // Plot the pie graph for the categories
  let catsPie = $.jqplot("catsPie", [sortedTops], {
    grid: {
      background: "transparent",
      drawBorder: false,
      shadow: false,
    },
    legend: {
      location: "e",
      show: true,
    },
    seriesColors: seriesColors,
    seriesDefaults: {
      renderer: $.jqplot.PieRenderer,
      rendererOptions: {
        dataLabelPositionFactor: .6,
        dataLabelThreshold: 4,
        highlightMouseOver: false,
        showDataLabels: true,
        sliceMargin: 2,
        startAngle: -90,
      },
      shadow: false,
    },
  });

  // Pick out the top (any-level) categories
  let catNames = Object.keys(cats).sort(function(a, b) {
    return cats[b].vcount - cats[a].vcount;
  }).slice(0, 13);

  $("#cats").empty();
  let largest = null;
  let lastTop = "";
  for (x in catNames) {
    let name = catNames[x];
    let top = name.replace(/\/.*/, "");
    let catData = cats[name];

    // remove the path prefix
    name = name.replace(/^.*\//, "").replace(/_/g, " ");

    let champs = catData.champs.items;
    if (!largest) {
      largest = catData.vcount;
    }
    let barWidth = Math.floor((300.00 * catData.vcount) / largest);
    if (barWidth < 5) {
      barWidth = 5;
    }

    // Display a bar colored based on the category
    let catNode = $("<cpan/>").addClass("cat").append(
      $("<span/>").addClass("label").text(name),
      $("<div/>").addClass("bar").text("_").css({
        "background-color": topColors[top],
        "width": barWidth + "px"
      }));

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
