/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var crypto = require("./crypto");
var express = require("express");
var rawData = require("./rawData");

var app = module.exports = express.createServer();

// Configuration

app.configure(function() {
  app.use(express.bodyParser());
  app.use(app.router);
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true,
  }));
});

// Routes

app.post("/upload", function(req, res) {
  var ok = rawData.save(req.body);
  res.send(ok ? 200 : 400);
});

app.get("/view/:url", function(req, res) {
  rawData.getTotalSize(function(size) {
    res.send("No related data yet for " + req.params.url + "<br/>" +
             "Total data uploaded: " + (size / 1024 / 1024).toFixed(1) + "MB");
  });
});

crypto.ready(function() {
  app.listen(80);
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
