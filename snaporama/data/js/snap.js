/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let $ = document.getElementById;
let C = document.createElement;

self.on("message", function(data) {
  console.log(data);
  let ls = $('content-list');
  ls.innerHTML = "";
  
  $('new-snap-button').addEventListener("click", function(e) {
    e.preventDefault();
    self.postMessage({
      "snap": true,
    });
  }, false);

  data.folders.forEach(function ({title, id}) {
    let item = C('li');
    let link = C('a');
    link.innerHTML = title;
    link.setAttribute('href', "#");
    link.setAttribute('value', id);
    link.addEventListener("click", function(e) {
      e.preventDefault();
      self.postMessage({
        "id" : e.target.getAttribute('value'),
      })
      console.log("click");
    }, false);
    item.appendChild(link);
    ls.appendChild(item);
    
  });
});
