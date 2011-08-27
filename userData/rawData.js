var crypto = require("./crypto");
var fs = require("fs");

const DATA_PATH = "encrypted";

// Make sure the directory exists
fs.mkdir(DATA_PATH, 0750);

/**
 * Calculate the total number of bytes in all raw data files
 *
 * @param onSize: Callback that gets the number of bytes of all files
 */
exports.getTotalSize = function(onSize) {
  fs.readdir(DATA_PATH, function(error, files) {
    var total = 0;

    // Get the next file in a closure that recursively calls itself
    (function getNextFile() {
      // Trigger the callback with the total size when we're done
      if (files.length == 0)
        return onSize(total);

      // Grab the next file and update the remaining files
      var file = DATA_PATH + "/" + files.shift();
      fs.stat(file, function(error, stats) {
        total += stats.size;
        getNextFile();
      });
    })();
  });
};

/**
 * Read all raw data files
 *
 * @param onFile: Callback with 1 parameter with the file data
 *                Callback must return true to get the next file
 */
exports.readAll = function(onFile) {
  fs.readdir(DATA_PATH, function(error, files) {
    // Get the next file in a closure that recursively calls itself
    (function getNextFile() {
      // Trigger the callback with nothing if there's no files
      if (files.length == 0)
        return onFile();

      // Grab the next file and update the remaining files
      var file = DATA_PATH + "/" + files.shift();
      fs.readFile(file, "utf8", function(error, blob) {
        crypto.decrypt(blob, function(json) {
          // Give the callback a js object; grab more files when it returns true
          if (onFile(JSON.parse(json)))
            getNextFile();
        });
      });
    })();
  });
};

/**
 * Save a data array to disk
 *
 * @param data: Array of data arrays [url, timestamp, sessionid]
 */
exports.save = function(data) {
  try {
    // Only accept data that we're expecting
    data = data.filter(function(entry) {
      return entry.length == 3 &&
             typeof entry[0] == "string" &&
             typeof entry[1] == "number" &&
             typeof entry[2] == "number";
    });

    // Don't bother writing nothing to disk
    if (data.length == 0)
      return false;

    // Save the data to disk as JSON
    var file = DATA_PATH + "/" + Date.now();
    crypto.encrypt(JSON.stringify(data), function(blob) {
      fs.writeFile(file, blob);
    });

    return true;
  }
  catch(ex) {
    return false;
  }
};
