function Dashboard(doc) {
  let me = this;
  me.search = new Search();
  me.hostList = [];
  this.doc = doc;
  let $ = me.doc.getElementById;
  
  $('version-search').style.display = "block";

  function handleSubmit (e) {
    me.handleSubmit(e);
  }

  function handleClearTime (e) {
    me.handleClearTime(e);
  }

  function handleBlankSubmit(e) {
    me.handleSubmit();
  }

  $('clear-time').addEventListener("click", handleClearTime, false);
  $('search-form').addEventListener("submit", handleSubmit, false);
  $('time-form').addEventListener("click", handleBlankSubmit, false);
}


Dashboard.prototype.addPinned = function(revHost) {
  let me = this;
  let idx = me.hostList.indexOf(revHost);
  reportError(revHost);
  reportError(J(me.hostList));
  reportError(idx);
  if (idx < 0) {
    me.hostList.push(revHost);
  }
  me.refreshPinned();
};

Dashboard.prototype.removePinned = function(revHost) {
  let me = this;
  reportError(revHost);
  reportError(me.hostList);
  let idx = me.hostList.indexOf(revHost);
  reportError(idx);
  if (idx < 0) {
    return;
  }
  me.hostList.splice(idx, 1);
  reportError(me.hostList)
  me.refreshPinned();
}

Dashboard.prototype.refreshPinned = function() {
  let me = this;
  let $ = me.doc.getElementById;
  let C = me.doc.createElement;

  function handleUnpinClick(e) {
    me.handleUnpinClick(e);
  }
  $('pinned-list').innerHTML = "";
  me.hostList.forEach(function(revHost) {
    let link = C('a')
    link.setAttribute('class', 'website');
    let webName = revHost.split('').reverse().join('').slice(1);
    link.innerHTML = 'X ' + webName;
    link.setAttribute('href', '#');
    link.addEventListener("click", handleUnpinClick, false);
    let el = C('li');
    el.appendChild(link);
    $('pinned-list').appendChild(el);
  });
  me.handleSubmit();
}

Dashboard.prototype.handleUnpinClick = function(e) {
  let me = this;
  e.preventDefault();
  let webName = e.target.innerHTML;
  let revHost = webName.slice(2).split('').reverse().join('') + '.';
  me.removePinned(revHost);
}

Dashboard.prototype.handleSubmit = function(e) {
  let me = this;
  if (e) {
    me.e = e;
  } else if (me.e) {
    e = me.e;
  } else {
    return;
  }
  reportError("handline submit");
  let me = this;
  e.preventDefault();
  let $ = me.doc.getElementById;
  let C = me.doc.createElement;
  $('result-list').innerHTML = "";

  let params = {
    preferredHosts: me.hostList,
  };
  /*
  let startDate = parseInt($('startDate').value);
  let endDate = parseInt($('endDate').value);
  */

  let timeRange = 0;
  
  let elems = me.doc.getElementsByName('timerange');
  for (let i = 0; i < elems.length; i++) {
    let elem = elems[i];
    if (elem.checked) {
      timeRange = parseInt(elem.value);
    }
  }
  /*
  .forEach(function (elem) {
    if (elem.checked) {
      timeRange = parseInt(elem.value);
    }
  });
  */
  reportError("TIME RANGE: " + timeRange);

  params['timeRange'] = timeRange;

  try {
  me.search.search($('search-field').value, params).forEach(function({id, title, url, rev_host}) {
    let el = C('li');
    let link = C('a');
    let blank = C('br');
    let website = C('a');
    

    function handleHostClick(e) {
      me.handleHostClick(e);
    }
    let host = rev_host.split('').reverse().join('').slice(1);
    website.setAttribute('class', 'website');
    website.setAttribute('href', '#');
    website.innerHTML = host;
    website.addEventListener("click", handleHostClick, false);

    let loc = C('span')
    loc.setAttribute('class', 'location');
    loc.innerHTML = url.slice(0,100);
    link.innerHTML = title;
    link.setAttribute('href', url);
    link.setAttribute('target', '_blank');
    el.appendChild(link);
    el.appendChild(website);
    el.appendChild(blank);
    el.appendChild(loc);
    $('result-list').appendChild(el);
  });
  } catch (ex) { reportError(J(ex)) };
}

Dashboard.prototype.handleHostClick = function(e) {
  let me = this;
  e.preventDefault();
  let revHost = ("." + e.target.innerHTML).split('').reverse().join('');
  me.addPinned(revHost);
}

Dashboard.prototype.handleClearTime = function(e) {
  let me = this;
  let elems = me.doc.getElementsByName('timerange');
  for (let i = 0; i < elems.length; i++) {
    elems[i].checked = false;
  }
  me.handleSubmit();

  /*
  $('start-date').value = "";
  $('end-date').value = "";
  $('startDate').value = "";
  $('endDate').value = "";
  */
}
