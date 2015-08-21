/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const BASE_DOMAIN = "https://sitesuggest.mozillalabs.com/";
const CATEGORIES_FILE = "top_categories_domains_filtered_thumbs.json";

// Read in the top categories data
var topCategories, knownCategories;
require("fs").readFile(__dirname + "/" + CATEGORIES_FILE, "utf8", function(err, json) {
  topCategories = JSON.parse(json);
  knownCategories = Object.keys(topCategories);
});

// Handle requests for site suggestion for a category
require("http").createServer(function(request, response) {
  function respond(statusCode, dataObject) {
    response.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Vary": "Category"
    });
    response.end(JSON.stringify(dataObject));
  }

  // Treat all other requests as a suggestion, so bail without a category
  var category = request.headers.category;
  if (category == null) {
    respond(400, null);
    return;
  }

  // Bail if the category is unknown
  category = category.toLowerCase();
  if (knownCategories.indexOf(category) == -1) {
    respond(404, null);
    return;
  }

  // Pick one site to recommend
  var choices = topCategories[category];
  var choice = choices[Math.floor(Math.random() * choices.length)];

  // Package up a response for the site suggestion
  respond(200, {
    category: category,
    image: BASE_DOMAIN + "images/" + choice.thumb_filename,
    title: choice.title,
    url: choice.url
  });
}).listen(8080);
