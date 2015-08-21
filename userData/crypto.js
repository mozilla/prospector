/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var bcrypt = require("bcrypt");
var crypto = require("crypto");
var fs = require("fs");
var stdin = process.stdin;
var stdio = process.binding("stdio");

// Generated from bcrypt.gen_salt(14)
const BCRYPT_SALT = "$2a$14$ktKyuMsuV1.SLfXHAelXne";
const VERIFIER_FILE = "verifier";

// Immediately read in the verifier file and save the data
var diskData;
fs.readFile(VERIFIER_FILE, function(error, data) {
  diskData = data;
  askPassword();
});

// Ask for the password and store the hashed representation
var passwordHash;
function askPassword() {
  // Ask for a password
  if (diskData == null)
    console.log("Enter password to initialize:");
  else
    console.log("Enter password to verify:");

  // Prepare to read in keystrokes
  stdin.resume();
  stdio.setRawMode(true);

  // Build up a password to verify
  var password = "";
  stdin.on("data", function onData(char) {
    // Look for certain special character keys
    char = char + "";
    switch (char) {
      // Quit on Ctrl-C
      case "\u0003":
        process.exit();
        break;

      // Finish input on Ctrl-D or newlines
      case "\u0004":
      case "\n":
      case "\r":
        // Clean up input and listeners when finishing
        stdin.pause();
        stdin.removeListener("data", onData);
        stdio.setRawMode(false);

        // Generate a password bcrypt hash from the input
        passwordHash = bcrypt.encrypt_sync(password, BCRYPT_SALT);

        // Generate a token to verify against
        var hasher = crypto.createHash("sha512");
        hasher.update(passwordHash);
        var verifier = hasher.digest();

        // Save the verifier to disk if initializing
        if (diskData == null) {
          fs.open(VERIFIER_FILE, "w", 0440, function(error, file) {
            fs.write(file, verifier);
            fs.close(file);
            setReady();
          });
        }
        // Verify the password
        else if (verifier == diskData)
          setReady();
        // Try again
        else
          askPassword();
        break;

      // Everything else adds to the password
      default:
        password += char;
        break;
    }
  });
}

// Encrypt data with the password hash
exports.encrypt = function(data, onEncrypt) {
  exports.ready(function() {
    var encrypter = crypto.createCipher("aes256", passwordHash);
    onEncrypt(encrypter.update(data, "utf8") + encrypter.final());
  });
};

// Decrypt data with the password hash
exports.decrypt = function(data, onDecrypt) {
  exports.ready(function() {
    var decrypter = crypto.createDecipher("aes256", passwordHash);
    onDecrypt(decrypter.update(data, null, "utf8") + decrypter.final("utf8"));
  });
};

// Remember if we're ready and what callbacks to trigger
var ready = false;
var callbacks = [];
function setReady() {
  ready = true;

  // Trigger each callback asynchronously and clear the array
  callbacks.forEach(function(callback) {
    process.nextTick(callback);
  });
  callbacks.length = 0;
}

// Allow hooking into when crypto is ready
exports.ready = function(callback) {
  // Already ready so call async
  if (ready)
    process.nextTick(callback);
  // Not ready so track the callback
  else
    callbacks.push(callback);
};
