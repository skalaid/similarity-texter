/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $               = require('jQuery');
var FileInputReader = require('../inputReader/fileInputReader.js');
var InputText       = require('./inputText.js');
var SimTexter       = require('../simtexter/simtexter.js');
var TextInputReader = require('../inputReader/textInputReader.js');

/**
 * Creates an instance of a {Controller}, 
 * which handles user interaction (data reading, input control, comparison).
 * Interacts with the {View} object to render the final output.
 * @constructor
 * @this  {Controller}
 * @param {Storage} storage - the object that holds the app's settings 
 * @param {View}    view    - the app's view
 */
function Controller(storage, view) {
	this.storage              = storage;
	this.view                 = view;
	this.maxCharactersPerPage = 1900;
	this.maxNumberOfPages     = 500;
	this.inputTexts           = [ new InputText(), new InputText() ];
	
	this._bindEvents();
	this._updateUI(this.storage.data);
}

/**
 * Displays a warning message if input is too long (> maxNumberOfPages).
 * @function
 * @private
 * @param {Number} idx - the index of the {InputText} object in inputTexts[]
 */
Controller.prototype._alertLongInput = function(idx) {
	var self = this;
	
	// Compute approximate number of pages for inputText
	var nrOfPages = self.inputTexts[idx].getNumberOfPages(self.maxCharactersPerPage);
	// If greater than maximum number of pages, display warning message
	if (nrOfPages > self.maxNumberOfPages) {
		var inputMode = self.inputTexts[idx].mode;
		var message = [
				inputMode, ' ', (idx + 1), ' is too long. To prevent visualization issues, please consider truncating this ', inputMode.toLowerCase(), '.' 
			].join('');
		var delay = self._computeReadingSpeed(message);
		self.view.showAlertMessage('warning', message, delay);
	}
};

/**
 * Binds events.
 * @function
 * @private
 */
Controller.prototype._bindEvents = function() {
	var self = this;
	
	self.view.bind('changeSpinnerInput', function(id, newValue) {
		self._updateStorage(id, newValue);
	});
	
	self.view.bind('compare', function() {
		self._compare();
	});
	
	self.view.bind('dismissAlert');
	self.view.bind('hidePrintDialog');
	self.view.bind('initBootstrap');
	
	self.view.bind('inputFile', function(file, idx, loadingElem, tabPaneId) {
		self._readFile(file, idx, loadingElem, tabPaneId);
	});
	
	self.view.bind('inputText', function(text, idx, tabPaneId) {
		self._readText(text, idx, tabPaneId);
	});
	
	self.view.bind('print', function(hideModalPromise) {
		self._print(hideModalPromise);
	});
	
	self.view.bind('resize');
	self.view.bind('scrollToMatch');
	self.view.bind('selectTab');
	
	self.view.bind('selectHTMLOption', function(idx, newValue, text) {
		self.inputTexts[idx].setHTMLOption(newValue);
		if (text) {
			self._readText(text, idx, self.inputTexts[idx].tabPaneId);
		}
	});
	
	self.view.bind('selectSettingsOption', function(id, newValue) {
		self._updateStorage(id, newValue);
	});
	
	self.view.bind('showPrintDialog');
	self.view.bind('toggleInputPanel');
	self.view.bind('toggleSettingsSidebar');
	self.view.bind('toggleSettingsSidebarPanes');
};

/**
 * Initiates the comparison process.
 * @function
 * @private
 */
Controller.prototype._compare = function() {
	var self = this;
	
	if (self._isInputValid()) {
		self.view.toggleWaitingCursor('show');
		var simtexter = new SimTexter(self.storage);
		
		setTimeout(function() {
			simtexter.compare(self.inputTexts).then(
				// On success, update information nodes and display similarities
				function(nodes) {
					self.view.results = {
						texts         : simtexter.texts,
						uniqueMatches : simtexter.uniqueMatches
					};
					
					self.view.createTemplates();
					self.view.showSimilarities(nodes);
					self.view.resetScrollbars();
				},
				// On error, clear output panel and display warning message
				function(message) {
					self.view.clearOutputPanel();
					var delay = self._computeReadingSpeed(message);
					self.view.showAlertMessage('info', message, delay);
				}
			);
		}, 200);
	}
};

/**
 * Returns the amount of time in milliseconds
 * that a user needs in order to read a message.
 * @function
 * @private
 * @param {String} message - the message to be read
 */
Controller.prototype._computeReadingSpeed = function(message) {
	var minMS = 6000;
	var speed = Math.round(message.length / 40) * 4000;
	return (speed > minMS) ? speed : minMS;
};

/**
 * Checks if the user has provided a valid input
 * in both source and target input panes.
 * If not, the user is prompted.
 * @function
 * @private
 * @returns {Boolean} - true if input is valid, else false.
 */
Controller.prototype._isInputValid = function() {
	var self = this,
			isValid = true,
			activeTabPaneIds = self.view.getActiveTabPaneIds(),
			iTextsLength = self.inputTexts.length;
	
	for (var i = 0; i < iTextsLength; i++) {
		var inputText = self.inputTexts[i];
		var activeTabPaneId = activeTabPaneIds[i];
		
		var isInputTextValid = (inputText.text !== undefined && inputText.tabPaneId === activeTabPaneId);
		
		if (!isInputTextValid) {
			self.view.toggleErrorStatus('show', activeTabPaneId);
		} else {
			self.view.toggleErrorStatus('hide', activeTabPaneId);
		}
		
		isValid = isValid && isInputTextValid;
	}
	
	return isValid;
};

/**
 * Sends the contents of the current window
 * to the system's printer for printing. 
 * @function
 * @private
 * @param {Promise} hideModalPromise - a promise that handles the hiding 
 * 																		 of the 'PRINT OUTPUT' dialog. 
 * 																		 When resolved, the current window 
 * 																		 is sent to printing.
 */
Controller.prototype._print = function(hideModalPromise) {
	var success = function() {
		setTimeout(function() {
			window.print();
		}, 700);
	};
	
	$.when(hideModalPromise).then(success);
};

/**
 * Extracts the contents of the selected file
 * and updates the relevant fields of the {InputText} object.
 * @function
 * @private
 * @param {FileList} file        - the file selected by the user
 * @param {Number}   idx         - the index of the {InputText} object 
 * 																 in inputTexts[] to be updated.
 *                                 0: input in left-side pane 
 *                                 1: input in right-side pane
 * @param {Object}   loadingElem - the node element that shows 
 *                                 the progress of reading  
 * @param {String}   tabPaneId   - the id of the active tab pane
 */
Controller.prototype._readFile = function(file, idx, loadingElem, tabPaneId) {
	var self = this,
	    ignoreFootnotes = self.storage.getItemValueByKey('ignoreFootnotes');
	    
	var success = function(text) {
			// Update {InputText} object
			self.inputTexts[idx].setFileInput(file, text, tabPaneId);
			self.view.loading('done', loadingElem);
			self.view.clearTabPaneTextInput(idx);
			self._alertLongInput(idx);
		};
		
		var error = function(message) {
			self.inputTexts[idx].reset();
			self.view.loading('error', loadingElem);
			self.view.clearTabPaneTextInput(idx);
			
			var delay = self._computeReadingSpeed(message);
			self.view.showAlertMessage('error', message, delay);
		};
	
	if (file) {
		var loadingStarted = self.view.loading('start', loadingElem);
		var fileInputReader = new FileInputReader(file, ignoreFootnotes);
		fileInputReader.readFileInput(loadingStarted).then(success, error);
	} else {
		self.view.loading('cancel', loadingElem);
		self.inputTexts[idx].reset();
	}
};

/**
 * Extracts the contents of the typed/pasted HTML/plain text
 * and updates the relevant fields of the {InputText} object.
 * @function
 * @private
 * @param {String} text      - the HTML/plain text provided by the user
 * @param {Number} idx       - the index of the {InputText} object 
 * 														 in inputTexts[] to be updated.
 *                             0: input in left-side pane, 
 *                             1: input in right-side pane
 * @param {String} tabPaneId - the id of the active tab pane
 */
Controller.prototype._readText = function(text, idx, tabPaneId) {
	var self = this;
	
	var success = function(cleanedText) {
		// Update {InputText} object
		self.inputTexts[idx].setTextInput(cleanedText, tabPaneId);
		self.view.toggleCompareBtn('enable');
		self.view.clearTabPaneFileInput(idx);
		self._alertLongInput(idx);
	};
	
	var error = function(message) {
		self.inputTexts[idx].reset();
		self.view.toggleCompareBtn('enable');
		var delay = self._computeReadingSpeed(message);
		self.view.showAlertMessage('error', message, delay);
	};
	
	if (text.length > 0 && /\S/.test(text)) {
		if (self.inputTexts[idx].isHTML) {
			self.view.toggleCompareBtn('disable');
			var textInputReader = new TextInputReader();
			textInputReader.readTextInput(text).then(success, error);
		} else {
			success(text);
		}
	} else {
		self.inputTexts[idx].reset();
	}
};

/**
 * Updates the value of a setting, stored in the {Storage} object.
 * @function
 * @private
 * @param {String}           id       - the id of the setting
 * @param {(Boolean|Number)} newValue - the new value of the setting
 */
Controller.prototype._updateStorage = function(id, newValue) {
	var self = this;
	self.storage.setItemValueById(id, newValue);
};

/**
 * Updates the {View} object with the values of the settings,
 * stored in the {Storage} object.
 * @function
 * @private
 * @param {Object} data - the object that holds the storage's settings
 */
Controller.prototype._updateUI = function(data) {
	var self = this;
	
	for (var key in data) {
		var obj = data[key];
		self.view.updateUIOption(obj.id, obj.type, obj.value);
	}
};

module.exports = Controller;