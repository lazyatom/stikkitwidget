/* Copyright (c) James Adam, 2007
   See MIT_LICENSE for further details, all you legal types.
   Essentially, you can use and modify this code in any way, as long as you attribute the original version to myself.

   Here's a quick effort at a Stikkit widget for Mac OS X. If you find any bugs or have suggestions,
   please send 'em on to me at james@lazyatom.com.
*/

var current_version = "v0.8.1";

// references to some of our controls.
var stikkit_select;
var stikkit_text;
var search_field;
var save_button;
var status_text;
var auto_sync;
var sync_delay;

function Stikkit(attributes) {
  this.end = attributes.end;
  this.text = attributes.text;
  this.completed = attributes.complete;
  this.name = attributes.name;
  this.updated = attributes.updated;
  this.start = attributes.start;
  this.created = attributes.created;
  this.start_timezone = attributes.start_timezone;
  this.url = attributes.url;
  this.end_timezone = attributes.end_timezone;
  this.id = attributes.id;
  this.tags = attributes.tags;
  
  this.original_text = attributes.text;
  this.has_changed = false;
  this.is_new = false;
};

// global connection reference. because I'm *not* shit hot at Javascript, alas,
// and all the callback madness gets messy.
var conn;

var StikkitManager = {

	stikkits: [],
	
	new_stikkits: [],
	successfully_created: [],
	
	current: null,
	
	auto_sync: false,
	
	request: function(method, resource, options, callback) {
		conn = new XMLHttpRequest();
		url = "http://api.stikkit.com/";
		url += resource + ".json";
		url += "?api_key=" + this.api_key();
		var http_method = method;
		var async = true;
		if (method == "PUT") {
			http_method = "POST";
			url += "&_method=put";
		} else if (method == "DELETE") {
			http_method = "POST";
			url += "&_method=delete";
		}
		url += "&" + options;

		if (http_method == "POST") {
			conn.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
			async = false;			
		}

		conn.onreadystatechange = callback;

		alert("sending " + http_method + " request: " + url);

		conn.open(http_method, url, async);
		conn.send(null);	
	},
	

	loadFromServer: function(options, callback) {
		this.request("GET", "stikkits", options, function() {
			if (conn.readyState == 4) {
				alert("got: " + conn.responseText);
				callback(eval(conn.responseText));
			}
		});
	},
	
	
	getStikkits: function() {
		alert("getting stikkits");
		var options = "";
		
		var search_text = search_field.value;
		if (search_text != null && search_text != "") { 
			options = "&name=" + search_text;
		}
    
		this.loadFromServer(options, function(server_stikkits){
			StikkitManager.stikkits = server_stikkits;
			setStatus("", false);
			StikkitManager.updateDisplay();
		});
		return true;
	},

	search: function(event) {
		this.storeCurrentStikkitChange();
		this.current = null;
		this.is_searching = true;
		this.getStikkits();
	},

	storeCurrentStikkitChange: function() {
		if ((this.current != null) && (stikkit_text.value != this.current.text))  { // it was modified
			save_button.className = "apple-no-children sync-needed";
			this.current['new_text'] = stikkit_text.value;
		}
	},

	createNewStikkits: function() {
		this.successfully_created = [];
		for(var i = 0; i < this.new_stikkits.length; i++) {
		   this.create(this.new_stikkits[i]);
		}
		for(var i = 0; i < this.successfully_created.length; i++) {
			removeFromArray(StikkitManager.new_stikkits, this.successfully_created[i]);
		}
	},
	
	sync: function() {
		if (!this.is_api_key_set()) {
			setStatus("API Key?");
			return;
		}
		setStatus("Sync starting...");
		this.storeCurrentStikkitChange();
		this.createNewStikkits();

		var options = "";
		var search_text = search_field.value;
		if (search_text != null && search_text != "") { 
			options = "&name=" + search_text;
		}

		this.loadFromServer(options, function(server_stikkits) {
			var original_stikkits = StikkitManager.stikkits;
			StikkitManager.stikkits = server_stikkits;
			setStatus("Merging changes...");
			for (var i = 0; i < StikkitManager.stikkits.length; i++) {
				// compare the downloaded stikkit to our old copy.
				var server_stikkit = server_stikkits[i];
				var original_stikkit = StikkitManager.by_id(server_stikkit.id, original_stikkits);
				if (original_stikkit != null) { // i.e., it exists
					if (original_stikkit.text != server_stikkit.text) { // it was changed on the server
						// ??? do nothing, the server copy is used
					} else if ((original_stikkit.new_text != undefined) && (original_stikkit.new_text != server_stikkit.text)) { // it was edited locally
						// update the new server-retrieved stikkit with the new text
						alert("stikkit " + original_stikkit.id + " was changed. sending to server.");
						StikkitManager.save(server_stikkit.id, original_stikkit.new_text);
						server_stikkit.text = original_stikkit.new_text;
				   }
				}
			}
			save_button.className = "apple-no-children";			
			setStatus("Sync complete.");
			if (StikkitManager.current != null) {
				var current_from_server = StikkitManager.by_id(StikkitManager.current.id, StikkitManager.stikkits);
				if (current_from_server != null) {
					//current_from_server['new_text'] = stikkit_text.value;
					StikkitManager.show(current_from_server); // in case it changed on the server.
				} else {
					StikkitManager.show(StikkitManager.stikkits[0]); // if it was deleted.
				}
			}
			StikkitManager.updateDisplay();		
		});
	},
	
	_new: function(event) {
		this.storeCurrentStikkitChange();
		var stikkit = new Object;
		stikkit['text'] = "Enter your stikkit contents here";
		this.new_stikkits.push(stikkit); 
		// we kind of skip updateDisplay here, since there might be a bad search
		this.stikkitsFound();
		this.show(stikkit);
		this.updateSelect();
		stikkit_text.focus();
		stikkit_text.select();
	},

	create: function(new_stikkit) {
		var options =  "raw_text=" + encodeURIComponent(new_stikkit.new_text);
		this.request("POST", "stikkits", options, function() {
			if (conn.readyState == 4) {
				StikkitManager.successfully_created.push(new_stikkit);
			}		
		});
	},
	
	save: function(id, text) {
		var options =  "raw_text=" + encodeURIComponent(text);
		this.request("PUT", "stikkits/"+id, options, function() {
			if (conn.readyState == 1) {
				//setStatus("Saving...", true);
			} else if (conn.readyState == 4) {
				//setStatus("Saved.", false);
				//StikkitManager.getStikkits();
			}		
		});	
	},
	
	deleteCurrent: function() {
		this._delete(this.current);
	},
	
	_delete: function(stikkit) {
		StikkitManager.request("DELETE", "stikkits/"+stikkit.id, "", function() {
			if (conn.readyState == 1) {
				setStatus("Deleting " + stikkit.id + "...", true);
			} else if (conn.readyState == 4) {
				setStatus("Deleted.", false);
				if (stikkit == StikkitManager.current) { 
					// remove our reference to it so it's not hanging around when we resync
					StikkitManager.current = null;
				}
				StikkitManager.sync();
			}		
		});	
	},
	
	updateDisplay: function() {
		if (StikkitManager.stikkits.length == 0) {
			this.noStikkitsFound();
		} else {
			this.stikkitsFound();
			if (StikkitManager.current == null) {
				this.show(this.stikkits[0]);
			}
			//alert("stikkit changed: " + stikkitChanged() + ", show on load: " + StikkitManager.show_on_load);
			//if (StikkitManager.show_on_load || (!StikkitManager.is_new() && !stikkitChanged())) {
			//	StikkitManager.show(StikkitManager.stikkits[0]);	
			//	StikkitManager.show_on_load = false;			
			//}
		}	
		this.updateSelect();
	},
	
	updateSelect: function() {
		options = "";
		for (var i = 0; i < this.stikkits.length; i++) {
			options += "<option value='1'"
			if ((this.current != null) && (this.current.id == this.stikkits[i].id)) {
				options += " selected";
			}
			options += ">" + this.stikkits[i].name + (this.is_edited(this.stikkits[i]) ? "*" : "") + "</option>"
		}
		if (this.new_stikkits.length > 0) {
			options += "<optgroup label=\"New stikkits - click sync to save\">"
			for (var i = 0; i < this.new_stikkits.length; i++) {
				options += "<option value='1'"
				if ((this.current != null) && (this.current == this.new_stikkits[i])) {
					options += " selected";
				}
				options += ">New Stikkit #" + (i+1) + "</option>"
			}
			options += "</optgroup>"
		}
		stikkit_select.innerHTML = options;
	},
	
	show: function(stikkit) {
		if (stikkit != undefined) {
			this.current = stikkit;
			if (this.is_new()) {
				document.getElementById("delete_button").childNodes[0].childNodes[1].innerHTML = "cancel";
			} else {
				document.getElementById("delete_button").childNodes[0].childNodes[1].innerHTML = "delete";
				if (this.is_edited(stikkit)) {
					setStatus(stikkit.id + "*", false);
				} else {
					setStatus(stikkit.id, false);
				}
			}
			if (stikkit.new_text != undefined) {
				stikkit_text.value = stikkit.new_text;
			} else {
				stikkit_text.value = stikkit.text;
			}
		}
		if (!this.is_searching) {
			stikkit_text.focus();
		}
	},
	
	is_edited: function(stikkit) {
		return (stikkit.new_text != undefined) && (stikkit.new_text != stikkit.text)	
	},
	
	is_new: function() {
		return (this.current.id == undefined);
	},
	
	by_id: function(id, collection) {
		for(var i = 0; i < collection.length; i++) {
			if (collection[i].id == id) {
				return collection[i];
			}
		}
		return null;
	},
	
	openCurrentInBrowser: function(event) {
		if (StikkitManager.current != null) {
			widget.openURL("http://stikkit.com/stikkits/" + StikkitManager.current.id);
		}
	},

	noStikkitsFound: function() {
	  stikkit_text.disabled = true;
	  stikkit_text.value = "No stikkits found."
	  if (search_field.value != "") {
		stikkit_text.value += "\n\nPerhaps nothing matches your search...";
	  }
	},

	stikkitsFound: function() {
		stikkit_text.disabled = false;
	},
	
	editingStikkit: function() {
		this.is_searching = false;
	},
	
	searchingStikkits: function() {
		this.is_searching = true;
	},
	
	api_key: function() {
		return widget.preferenceForKey("stikkit_api_key");
	},
	
	is_api_key_set: function() {
		alert("api key: " + this.api_key());
		return (this.api_key() != null && this.api_key() != undefined && this.api_key() != "");
	}	
}


// remove all marching elements from an array
function removeFromArray(array, item) {
	var i = 0;
	while (i < array.length) {
		if (array[i] == item) {
			array.splice(i, 1);
		} else {
			i++;
		}
	}
	return array;
}

function setStatus(text, busy) {
  status_text.innerHTML = text;
}

function changeStikkit(event) {
	StikkitManager.storeCurrentStikkitChange();
	if (stikkit_select.selectedIndex >= StikkitManager.stikkits.length) {
		StikkitManager.show(StikkitManager.new_stikkits[stikkit_select.selectedIndex - StikkitManager.stikkits.length]);
	} else {
		StikkitManager.show(StikkitManager.stikkits[stikkit_select.selectedIndex]);
	}
}

function stikkitChanged() {
  return (!StikkitManager.is_new() && (StikkitManager.current.text != stikkit_text.value));
}

function sync() {
	StikkitManager.sync();
	if (auto_sync.checked)
		setTimeout('sync();', sync_delay());
}

function deleteOrCancelStikkit(event) {
    if (StikkitManager.is_new()) {
		removeFromArray(StikkitManager.new_stikkits, StikkitManager.current);
		StikkitManager.show(StikkitManager.stikkits[0]);
		StikkitManager.updateDisplay();
	} else {
		StikkitManager.deleteCurrent();
	}
}

function sync_delay() {
	var delay = parseInt(document.getElementById("sync_delay").value);
	if (isNaN(delay)) {
		delay = 10;
	}
	return delay * 60000;
}

function randomizeCredits() {
	var credits = [
		"Hastily knocked together by",
		"Carved from solid funk by",
		"Unwittingly unleashed by",
		"Physically concieved by",
		"Wrent from the twisted brain-wrongs of",
		"Torn from the center of the Sun by",
		"Discovered frozen in Antarctica by",
		"Entirely not the responsibility of",
		"Nothing whatsoever to do with",
	];
	var index = Math.floor(Math.random()*credits.length);
	var selected = credits[index];
	document.getElementById("credits").innerHTML = selected + " James Adam";
}

function savePreferences() {
	var api_key = document.getElementById("api_key").value;
	if (StikkitManager.api_key() != api_key) { // the key was set or changed
		widget.setPreferenceForKey(api_key, "stikkit_api_key");
		// reload the stikkits
		StikkitManager.getStikkits();
	}
	widget.setPreferenceForKey(auto_sync.checked, "stikkit_auto_sync");
	StikkitManager.auto_sync = auto_sync.checked;
}

function loadPreferences() {
	// put the API key into the field
	if (StikkitManager.is_api_key_set()) {
		document.getElementById("api_key").value = StikkitManager.api_key();
	}
	if (widget.preferenceForKey("stikkit_auto_sync") != undefined) {
		auto_sync.checked = widget.preferenceForKey("stikkit_auto_sync");
		StikkitManager.auto_sync = auto_sync.checked;
	}
}

function clearPreferences() {
	widget.setPreferenceForKey(null, "stikkit_auto_sync");
	widget.setPreferenceForKey(null, "stikkit_api_key");
}


/* Here are the functions that Dashboard itself calls when it works with the widget */


function load()
{
	setupParts();
	
	stikkit_text = document.getElementById("stikkit_text");
	save_button = document.getElementById("save_button");
	status_text = document.getElementById("status_text");
	stikkit_select = document.getElementById("stikkit_select");
	search_field = document.getElementById("searchfield");
	auto_sync = document.getElementById("auto_sync");
		
	document.getElementById("version_label").innerHTML = current_version;
	
	loadPreferences();
	
	StikkitManager.sync();	
}

function remove()
{
}

function hide()
{
}

function show()
{
	if (StikkitManager.auto_sync)
		StikkitManager.sync();
}

/* When flipping the widget over to show the back */
function showBack(event)
{
	var front = document.getElementById("front");
	var back = document.getElementById("back");

	if (window.widget)
		widget.prepareForTransition("ToBack");

	front.style.display="none";
	back.style.display="block";
	
	randomizeCredits();
	
	if (window.widget)
		setTimeout('widget.performTransition();', 0);
}

/* Once we're done with the back of the widget */
function showFront(event)
{
	var front = document.getElementById("front");
	var back = document.getElementById("back");

	savePreferences();
	
	if (window.widget)
		widget.prepareForTransition("ToFront");

	front.style.display="block";
	back.style.display="none";
	
	if (window.widget)
		setTimeout('widget.performTransition();', 0);
}

if (window.widget)
{
	widget.onremove = remove;
	widget.onhide = hide;
	widget.onshow = show;
}
