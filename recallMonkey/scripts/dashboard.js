function Dashboard(doc) {
  let me = this;
  me.search = new Search();
  me.fluidLists = {
    "prioritized" : [],
    "excluded" : [],
  }
  this.doc = doc;
  let $ = me.doc.getElementById;
  
  $('version-search').style.display = "block";

  function handleSubmit (e) {
    me.handleSubmit(e);
  }

  function handleClearTime (e) {
    me.handleClearTime(e);
  }
  $('clear-time').addEventListener("click", handleClearTime, false);
  //$('search-form').addEventListener("submit", handleSubmit, false);
  $('search-form').addEventListener("keyup", handleSubmit, false);
  $('time-form').addEventListener("click", handleSubmit, false);
}


Dashboard.prototype.addPinned = function(revHost, listType) {
  let me = this;
  let idx = me.fluidLists[listType].indexOf(revHost);
  reportError(revHost);
  reportError(idx);
  if (idx < 0) {
    me.fluidLists[listType].push(revHost);
  }
  me.refreshPinned(listType);
};

Dashboard.prototype.removePinned = function(revHost, listType) {
  let me = this;
  let idx = me.fluidLists[listType].indexOf(revHost);
  reportError(idx);
  if (idx < 0) {
    return;
  }
  me.fluidLists[listType].splice(idx, 1);
  me.refreshPinned(listType);
}

Dashboard.prototype.refreshPinned = function(listType) {
  let me = this;
  let $ = me.doc.getElementById;
  let C = me.doc.createElement;

  function handleUnpinClick(e) {
    me.handleUnpinClick(e);
  }
  $(listType + '-list').innerHTML = "";
  me.fluidLists[listType].forEach(function(revHost) {
    let link = C('a')
    link.setAttribute('class', 'website');
    let webName = revHost.split('').reverse().join('').slice(1);
    link.innerHTML = 'X ' + webName;
    link.setAttribute('href', '#');
    link.setAttribute('value', listType);
    link.addEventListener("click", handleUnpinClick, false);
    let el = C('li');
    el.appendChild(link);
    $(listType + '-list').appendChild(el);
  });
  me.handleSubmit();
}

Dashboard.prototype.handleUnpinClick = function(e) {
  let me = this;
  e.preventDefault();
  let webName = e.target.innerHTML;
  let listType = e.target.getAttribute('value');
  let revHost = webName.slice(2).split('').reverse().join('') + '.';
  me.removePinned(revHost, listType);
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

  let params = {
    "preferredHosts": me.fluidLists["prioritized"],
    "excludedHosts": me.fluidLists["excluded"],
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
  
  $('result-list').style.visibility = "hidden";
  $('result-list').innerHTML = "";
  try {
  me.search.search($('search-field').value, params).forEach(function({id, title, url, rev_host}) {
    let el = C('li');
    let link = C('a');
    let blank = C('br');
    let website = C('span');
    let plus = C('a');
    let minus = C('a');

    function handleHostClick(e) {
      me.handleHostClick(e);
    }

    function handlePlusClick(e) {
      me.handlePlusClick(e);
    }

    function handleMinusClick(e) {
      me.handleMinusClick(e);
    }

    let host = rev_host.split('').reverse().join('').slice(1);
    website.setAttribute('class', 'website');
    website.innerHTML = host;
    
    plus.innerHTML = '(prioritize)';
    plus.setAttribute('class', 'website');
    plus.setAttribute('href', '#');
    plus.setAttribute('value', host);
    plus.addEventListener("click", handlePlusClick, false);
    minus.innerHTML = '(exclude)';
    minus.setAttribute('class', 'website');
    minus.setAttribute('href', '#');
    minus.setAttribute('value', host);
    minus.addEventListener("click", handleMinusClick, false);
    website.addEventListener("click", handleHostClick, false);

    let loc = C('span')
    loc.setAttribute('class', 'location');
    loc.innerHTML = url.slice(0,100);
    link.innerHTML = title;
    link.setAttribute('href', url);
    link.setAttribute('target', '_blank');
    el.appendChild(link);
    el.appendChild(website);
    el.appendChild(plus);
    el.appendChild(minus);
    el.appendChild(blank);
    el.appendChild(loc);
    $('result-list').appendChild(el);
  });
  } catch (ex) { reportError(J(ex)) };
  $('result-list').style.visibility = "visible";
}

Dashboard.prototype.handlePlusClick = function(e) {
  let me = this;
  e.preventDefault();
  let revHost = ("." + e.target.getAttribute('value')).split('').reverse().join('');
  me.addPinned(revHost, "prioritized");

}

Dashboard.prototype.handleMinusClick = function(e) {
  let me = this;
  e.preventDefault();
  let revHost = ("." + e.target.getAttribute('value')).split('').reverse().join('');
  me.addPinned(revHost, "excluded");
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
