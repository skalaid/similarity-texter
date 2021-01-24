/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {Storage},
 * which stores the values of the app's settings.
 * If local storage is supported by the browser,
 * these settings are also stored under the specified namespace,
 * thus providing the app with a state.
 * The last stored settings will be restored 
 * when refreshing the page or restarting the browser. 
 * @constructor
 * @this  {Storage}
 * @param {String} namespace - the namespace of the app (i.e. "simtexter")
 * @param {Object} data      - the object that holds the app's settings
 */
function Storage(namespace, data) {
	 this._db  = namespace;
	 this.data = this._initialize(namespace, data);
}

/**
 * Returns the value of a setting, retrieved by its key value.
 * @function
 * @param {String} key - the key value of the setting
 */
Storage.prototype.getItemValueByKey = function(key) {
	var self = this;
	return self._getItemByKey(key).value;
};

/**
 * Sets the new value of a setting, retrieved by its id value.
 * @function
 * @param {String}           id       - the id of the setting
 * @param {(Boolean|Number)} newValue - the new value of the setting
 */
Storage.prototype.setItemValueById = function(id, newValue) {
	var self = this,
	    item = self._getItemById(id);
	
	item.value = newValue;
	self._save(self.data);
};

/**
 * Retrieves a setting by its id value.
 * @function
 * @private
 * @param {String} id - the id of the setting
 */
Storage.prototype._getItemById = function(id) {
	var self = this,
	    data = self.data;
	
	for (var key in data) {
		var obj = data[key];
		if (obj.id === id) {
			return obj;
		}
	}
	
	return undefined;
};

/**
 * Retrieves a setting by its key value.
 * @function
 * @private
 * @param {String} key - the key value of the setting
 */
Storage.prototype._getItemByKey = function(key) {
	var self = this;
	return self.data[key];
};

/**
 * Stores the app's settings in the web browser's local storage
 * under the specified namespace.
 * If local storage is not supported, stores the settings
 * in {Storage.data}.
 * @function
 * @private
 * @param {String} namespace - the namespace of the app
 * @param {Object} data      - the object that holds the app's settings
 */
Storage.prototype._initialize = function(namespace, data) {
	if (localStorage) {
		if (!localStorage[namespace]) {
			localStorage.setItem(namespace, JSON.stringify(data));
		} else {
			var store = localStorage.getItem(namespace);
			return JSON.parse(store);
		}
	}
	
	return data;
};

/**
 * Stores the settings in the local storage.
 * @function
 * @private
 * @param {Object} data - the data (settings) to be updated
 */
Storage.prototype._save = function(data) {
	if (localStorage && localStorage[this._db]) {
		localStorage.setItem(this._db, JSON.stringify(data));
	}
	this.data = data;
};

module.exports = Storage;
