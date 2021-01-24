(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var Controller = require('./controller.js');
var Storage    = require('./storage.js');
var Template   = require('./template.js');
var View       = require('./view.js');

/**
 * Creates an instance of the application.
 * @constructor
 * @this  {App}
 * @param {String} namespace - the namespace of the app (i.e. "simtexter")
 */
function App(namespace) {
	// App's default settings (comparison & input reading options)
	var defaults = {
			'minMatchLength'    : { id: '#min-match-length',   type: 'inputText', value: 4     },
			'ignoreFootnotes'   : { id: '#ignore-footnotes',   type: 'checkbox',  value: false },
			'ignoreLetterCase'  : { id: '#ignore-letter-case', type: 'checkbox',  value: true  },
			'ignoreNumbers'     : { id: '#ignore-numbers',     type: 'checkbox',  value: false },
			'ignorePunctuation' : { id: '#ignore-punctuation', type: 'checkbox',  value: true  },
			'replaceUmlaut'     : { id: '#replace-umlaut',     type: 'checkbox',  value: true  }
		};
	
	this.storage    = new Storage(namespace, defaults);
	this.template   = new Template();
	this.view       = new View(this.template);
	this.controller = new Controller(this.storage, this.view);
}

module.exports = App;
},{"./controller.js":2,"./storage.js":4,"./template.js":5,"./view.js":6}],2:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $               = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
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
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../inputReader/fileInputReader.js":9,"../inputReader/textInputReader.js":10,"../simtexter/simtexter.js":14,"./inputText.js":3}],3:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {InputText},
 * which holds information on the user input.
 * @constructor
 * @this  {InputText}
 * @param {String} mode      - the mode of input (i.e. "file" or "text")
 * @param {File}   file      - the file selected by the user
 * @param {String} text      - the input string
 * @param {String} tabPaneId - the id of the tab pane
 */
function InputText(mode, file, text, tabPaneId) {
	this.tabPaneId  = tabPaneId;
	this.mode       = mode;
	this.isHTML     = false;
	this.fileName   = (file && file.name);
	this.text       = text;
}

/**
 * Returns the approximate number of pages of the input string.
 * @function
 * @param   {Number} maxCharactersPerPage - the maximum number of characters 
 * 																					per page
 * @returns {Number}                      - the ca. number of pages
 */
InputText.prototype.getNumberOfPages = function(maxCharactersPerPage) {
	return (this.text.length / maxCharactersPerPage);
};

/**
 * Resets some fields of the {InputText}.
 * @function
 */
InputText.prototype.reset = function() {
	this.tabPaneId  = undefined;
	this.mode       = undefined;
	this.fileName   = undefined;
	this.text       = undefined;
};

/**
 * Sets the fields for the file input.
 * @function
 * @param {File}   file      - the file selected by the user
 * @param {String} text      - the file input string
 * @param {String} tabPaneId - the id of the tab pane
 */
InputText.prototype.setFileInput = function(file, text, tabPaneId) {
	this.tabPaneId  = tabPaneId;
	this.mode       = 'File';
	this.fileName   = file.name;
	this.text       = text;
};

/**
 * Sets the fields for the text input.
 * @function
 * @param {String} text      - the text input string
 * @param {String} tabPaneId - the id of the tab pane
 */
InputText.prototype.setTextInput = function(text, tabPaneId) {
	this.tabPaneId  = tabPaneId;
	this.mode       = 'Text';
	this.fileName   = (this.isHTML) ? 'HTML text input' : 'Plain text input';
	this.text       = text;
};

InputText.prototype.setHTMLOption = function(newValue) {
	this.isHTML = newValue;
};

module.exports = InputText;
},{}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {Template},
 * which appends node elements in the DOM or updates their inner content. 
 * @constructor
 * @this {Template}
 */
function Template() {
}

/**
 * Returns the node element of the template
 * for displaying warning messages.
 * @function
 * @param   {String} type    - the type of warning
 * @param   {String} message - the text of the warning message
 * @returns {Object}         - the top node element
 */
Template.prototype.createAlertMessage = function(type, message) {
	var div = document.createElement('div');
		
	div.className = 'alert alert-warning';
	div.innerHTML = [
			'<table class="table table-condensed">',
				'<tbody>',
					'<tr>',
						'<td class="h5"><i class="fa fa-exclamation-circle"></i></td>',
						'<td>',
							'<h5>', type, '</h5>',
							'<p>', message, '</p>',
						'</td>',
					'</tr>',
				'</tbody>',
			'</table>'
		].join('');
		
	return div;
};

/**
 * Updates the inner HTML content of the output titles.
 * @function
 * @param {Array} texts - the array that holds information about the user input
 */
Template.prototype.createOutputTitles = function(texts) {
	var targets = [ document.getElementById('output-title-1'), document.getElementById('output-title-2') ],
	    tLength = targets.length;
		
	for (var i = 0; i < tLength; i++) {
		var fileName = texts[i].fileName || '';
		var mode     = texts[i].inputMode;
		var target   = targets[i];
		target.innerHTML = [
				'<p><b>', mode.toUpperCase(), ': </b>', fileName, '</p> ',
			].join('');
	}
};

/**
 * Returns the node element of the template
 * for displaying the "PRINT OUTPUT" dialog.
 * @function
 * @param   {Array} texts - the array that holds information 
 * 													about the user input
 * @returns {Object}      - the top node element
 */
Template.prototype.createPrintDialog = function(texts) {
	var section = document.createElement('section');
	
	section.id = 'modal-print';
	section.className = 'modal fade';
	section.setAttribute('tabindex', '-1');
	section.setAttribute('role', 'dialog');
	section.innerHTML = [
			'<div class="modal-dialog">',
	      '<div class="modal-content">',
          '<div class="modal-header">',
            '<button type="button" class="close" data-dismiss="modal" aria-label="Close">',
              '<span aria-hidden="true">&times;</span>',
            '</button>',
            '<h4 class="modal-title">Print output</h4>',
          '</div>',
          '<div class="modal-body">',
            '<div class="row">',
              '<div class="col-xs-6">',
                '<div class="form-group form-group-sm">',
                  '<label for="input-comment-1">1: Comment for ', texts[0].inputMode, '</label>',
                  '<textarea id="input-comment-1" class="form-control" rows="5" autocomplete="off" placeholder="Type a comment"></textarea>',
                '</div>',
              '</div>',
              '<div class="col-xs-6">',
                '<div class="form-group form-group-sm">',
                  '<label for="input-comment-2">2: Comment for ', texts[1].inputMode, '</label>',
                  '<textarea id="input-comment-2" class="form-control" rows="5" autocomplete="off" placeholder="Type a comment"></textarea>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
          '<div class="modal-footer">',
            '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancel</button>',
            '<button id="modal-print-btn" type="button" class="btn btn-primary btn-sm">Print</button>',
          '</div>',
	      '</div>',
      '</div>'
		].join('');
		
	return section;
};

/**
 * Updates the inner HTML content of the hidden, on screen, node element
 * that holds the information (statistics & comments) to be printed.
 * @function
 * @param {Array}  texts         - the array that holds information 
 * 																 about the user input
 * @param {Number} uniqueMatches - the number of the unique matches found
 */
Template.prototype.createPrintSummary = function(texts, uniqueMatches) {
	var target = document.getElementById('print-summary');
		
	target.innerHTML = [
			'<h4>COMPARISON SUMMARY</h4>',
			'<h6>DATE/TIME: ', (new Date()).toUTCString(), '</h6>',
		  '<table class="table table-condensed table-bordered">',
	      '<thead>',
	        '<tr>',
	          '<th class="col-xs-2"></th>',
	          '<th class="col-xs-5">', texts[0].fileName, '</th>',
	          '<th class="col-xs-5">', texts[1].fileName, '</th>',
	        '</tr>',
	      '</thead>',
	      '<tbody>',
	      	'<tr>',
	          '<th>Comment</th>',
	          '<td id="print-comment-1"></td>',
	          '<td id="print-comment-2"></td>',
	        '</tr>',
	        '<tr>',
	          '<th>Type</th>',
	          '<td>', texts[0].inputMode, '</td>',
	          '<td>', texts[1].inputMode, '</td>',
	        '</tr>',
	        '<tr>',
	          '<th>Characters</th>',
	          '<td>', texts[0].nrOfCharacters, '</td>',
	          '<td>', texts[1].nrOfCharacters, '</td>',
	        '</tr>',
	        '<tr>',
	          '<th>Words</th>',
	          '<td>', texts[0].nrOfWords, '</td>',
	          '<td>', texts[1].nrOfWords, '</td>',
	        '</tr>',
	        '<tr>',
	          '<th>Unique matches</th>',
	          '<td colspan="2">', uniqueMatches, '</td>',
	        '</tr>',
	      '</tbody>',
		  '</table>'
		].join('');
};

/**
 * Updates the inner HTML content
 * of the node element that holds the statistical data. 
 * @function
 * @param {Array}  texts         - the array that holds information 
 * 																 about the user input
 * @param {Number} uniqueMatches - the number of the unique matches found
 */
Template.prototype.createStatistics = function(texts, uniqueMatches) {
	var target = document.getElementById('statistics');
		
	target.innerHTML = [
		  '<table class="table table-condensed table-bordered">',
	      '<thead>',
          '<tr>',
            '<th class="col-xs-2"></th>',
            '<th class="col-xs-5">', texts[0].fileName, '</th>',
            '<th class="col-xs-5">', texts[1].fileName, '</th>',
          '</tr>',
	      '</thead>',
	      '<tbody>',
          '<tr>',
            '<th>Type</th>',
            '<td>', texts[0].inputMode, '</td>',
            '<td>', texts[1].inputMode, '</td>',
          '</tr>',
          '<tr>',
            '<th>Characters</th>',
            '<td>', texts[0].nrOfCharacters, '</td>',
            '<td>', texts[1].nrOfCharacters, '</td>',
          '</tr>',
          '<tr>',
            '<th>Words</th>',
            '<td>', texts[0].nrOfWords, '</td>',
            '<td>', texts[1].nrOfWords, '</td>',
          '</tr>',
          '<tr>',
            '<th>Unique matches</th>',
            '<td colspan="2">', uniqueMatches, '</td>',
          '</tr>',
	      '</tbody>',
		  '</table>'
		].join('');
};

module.exports = Template;
},{}],6:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $           = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
var TargetMatch = require('../autoScroll/targetMatch.js');

/**
 * Creates an instance of a {View},
 * which implements all the UI logic of the application.
 * @constructor
 * @this  {View}
 * @param {Template} template - the object that appends/updates elements 
 * 															in the DOM
 */
function View(template) {
	this.template = template;
	this.results  = {};
	
	// Selectors
	this.$alertsPanel          = $('#alerts-panel');
	this.$compareBtn           = $('#compare-btn');
	this.$contentWrapper       = $('#content-wrapper');
	this.$file                 = $(':file');
	this.$htmlOptions          = $('#html-text-1, #html-text-2');
	this.$inputLnk             = $('#input-lnk');
	this.$inputPanel           = $('#input-panel');
	this.$inputPanes           = $('#input-pane-1, #input-pane-2');
	this.$inputFiles           = $('#input-file-1, #input-file-2');
	this.$inputTexts           = $('#input-text-1, #input-text-2');
	this.$outputPanel          = $('#output-panel');
	this.$outputTexts          = $('#comparison-output-1, #comparison-output-2');
	this.$outputTextContainers = $('#comparison-output-1 > .comparison-output-container, #comparison-output-2 > .comparison-output-container');
	this.$outputParagraphs     = $('#comparison-output-1 > .comparison-output-container > p, #comparison-output-2 > .comparison-output-container > p');
	this.$printBtn             = $('#print-btn');
	this.$settingsSidebar      = $('#settings-sidebar');
	this.$settingsSidebarLnk   = $('#settings-sidebar-lnk');
	this.$settingsSidebarPanes = $('#comparison-options-pane, #input-options-pane');
	this.$spinner              = $('#min-match-length-spinner');
	this.$tooltip              = $('[data-toggle="tooltip"], [rel="tooltip"]');
	
	this._resetTextInputTabPanes();
	this._updateOutputPanelHeight();
	this._updateAlertsPanelWidth();
}

/**
 * Binds events depending on the name specified.
 * @function
 * @param {String} event     - the name of the event
 * @param {Function} handler - the callback function
 */
View.prototype.bind = function(event, handler) {
	var self = this;
	
	switch (event) {
		case 'changeSpinnerInput':
			self.$spinner
				.on('change mousewheel DOMMouseScroll', 'input[type="text"]', function(e) {
						var elem = e.target;
						var id = self._getId(elem);
				  		var minMatchLength = parseInt($(elem).val(), 10);
				  		
				  		if (e.type === 'mousewheel' || e.type === 'DOMMouseScroll') {
					  		// scrolling up
				  			if (e.originalEvent.wheelDelta > 0 || e.originalEvent.detail < 0) {
						        minMatchLength += 1;
						    }
						    // scrolling down
						    else {
						        minMatchLength -= 1;
						    }
				  		}
				  		
				  		minMatchLength = (minMatchLength < 1) ? 1 : minMatchLength; 
						
						handler(id, minMatchLength);
				    	self.updateUIOption(id, 'inputText', minMatchLength);
					}
				)
				.on('click', '.btn', function(e) {
					e.stopPropagation();
					
					var $elem = $(e.delegateTarget).find('input[type="text"]');
					var id = self._getId($elem);
		  		var minMatchLength = parseInt($elem.val(), 10);
					
					if ($(e.currentTarget).hasClass('plus')) {
						minMatchLength += 1;
					} else {
						minMatchLength = (minMatchLength > 1) ? (minMatchLength - 1) : minMatchLength;
					}
					
					handler(id, minMatchLength);
				    self.updateUIOption(id, 'inputText', minMatchLength);
				});
			break;
			
		case 'compare':
			self.$compareBtn.on('click', function(e) {
				e.stopPropagation();
				
				$(this).tooltip('hide');
				self.$settingsSidebar.removeClass('expanded');
				setTimeout(function() {
					handler();
				}, 200);
			});
			break;
		
		case 'dismissAlert':
			self.$alertsPanel.on('click', '.alert', function() {
				$(this).remove();
			});
			break;
			
		case 'initBootstrap':
			self.$tooltip.tooltip({
				container : 'body',
				delay     : { "show": 800, "hide": 0 },
				html      : true,
				placement : 'bottom',
				trigger   : 'hover'
			});
			
			self.$file.filestyle({
				buttonName  : "btn-primary",
				buttonText  : "Browse file",
				placeholder : "No file selected",
				size        : "sm"
			});
			break;
			
		case 'inputFile':
			self.$inputFiles.on('change', function(e) {
				var elem = e.target;
				var id = self._getId(elem);
				
				var tabPaneId = self._getId($(elem).parents('.tab-pane'));
				self.toggleErrorStatus('hide', tabPaneId);
				
				var file = elem.files[0];
				var idx = self._getIndex(id);
				var loadingElem = $(elem).parent();
				handler(file, idx, loadingElem, tabPaneId);
			});
			break;
		
		case 'inputText':
			self.$inputTexts.on('change input', function(e) {
				var elem = e.target;
				var $elem = $(elem);
				var tabPaneId = self._getId($elem.parents('.tab-pane'));
				
				if (e.type === 'input') {
					self.toggleErrorStatus('hide', tabPaneId);
				}
				
				if (e.type === 'change') {
					var id = self._getId(elem);
					var text = $elem.val();
					var idx = self._getIndex(id);
					handler(text, idx, tabPaneId);
				}
			});
			break;
			
		case 'hidePrintDialog':
			self.$contentWrapper.on('hide.bs.modal', '.modal', function(e) {
				self._togglePrintDialog('hide', e.target);
			});
			break;
		
		case 'print':
			self.$contentWrapper.on('click', '#modal-print-btn', function(e) {
				e.stopPropagation();
				
				var inputComment1  = $('#input-comment-1').val();
				var inputComment2  = $('#input-comment-2').val();
				$('#print-comment-1').text(inputComment1);
				$('#print-comment-2').text(inputComment2);
				
				var hideModalPromise = $('.modal').modal('hide').promise();
				handler(hideModalPromise);
			});
			break;
		
		case 'resize':
			$(window).on('resize', function() {
				self._updateOutputPanelHeight();
				self._updateAlertsPanelWidth();
			});
			break;
			
		case 'scrollToMatch':
			self.$outputTexts.on('click', 'a', function(e) {
				e.preventDefault();
				e.stopPropagation();
				
				var targetMatch = new TargetMatch(e.target);
				var scrollPosition = targetMatch.getScrollPosition();
				targetMatch.scroll(scrollPosition);
			});
			break;
			
		case 'selectHTMLOption':
			self.$inputPanel.on('change', 'input[type="checkbox"]', function(e) {
				var elem = e.target;
				var id = self._getId(elem);
				var idx = self._getIndex(id);
				var newValue = $(elem).prop('checked');
				var text = self.$inputTexts.eq(idx).val();
				handler(idx, newValue, text);
			});
			break;
			
		case 'selectSettingsOption':
			self.$settingsSidebarPanes.on('change', 'input[type="checkbox"]', function(e) {
				var elem = e.target;
				var id = self._getId(elem);
				var newValue = $(elem).prop('checked');
				handler(id, newValue);
			});
			break;
			
		case 'selectTab':
			self.$inputPanes.on('shown.bs.tab', 'a[data-toggle="tab"]', function(e) {
				var lastTabPaneId = $(e.relatedTarget).attr('href');
				self.toggleErrorStatus('hide', lastTabPaneId);
				});
			break;
			
		case 'showPrintDialog':
			self.$printBtn.on('click', function(e) {
				e.stopPropagation();
				self._togglePrintDialog('show');
			});
			break;
			
		case 'toggleInputPanel':
			self.$inputLnk.on('click', function(e) {
				e.preventDefault();
				e.stopPropagation();
				// Hide tooltip (if any)
				$(this).tooltip('hide');
				self._toggleInputPanel('toggle');
			});
			break;
			
		case 'toggleSettingsSidebar':
			self.$settingsSidebarLnk.on('click', function(e) {
				e.preventDefault();
				e.stopPropagation();
				// Hide tooltip (if any)
				$(this).tooltip('hide');
				self.$settingsSidebar.toggleClass('expanded');
			});
		
			// Hide settings sidebar when clicking inside the 'nav' and '#content-wrapper' elements
			$('body').on('click', 'nav, #content-wrapper', function() {
				self.$settingsSidebar.removeClass('expanded');
			});
			break;
			
		case 'toggleSettingsSidebarPanes':
			self.$settingsSidebar.on('click', '.panel-title', function() {
				$(this).toggleClass('active');
			});
			break;
			
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Removes all <p> nodes from each output pane
 * and hides the output panel.
 * @function
 */
View.prototype.clearOutputPanel = function() {
	var self = this;
	
	self.$outputParagraphs.each(function() {
		$(this).remove();
	});
	self._toggleOutputPanel('hide');
	self.toggleWaitingCursor('hide');
};

/**
 * Clears all input from the "FILE" tab pane.
 * @function
 * @param {Number} idx - the number of the tab pane
 *                       0: for left-side pane, 1: for right-side pane
 */
View.prototype.clearTabPaneFileInput = function(idx) {
	var self = this;
	var tabPaneId = '#tab-file-' + (idx + 1);
	$(tabPaneId + ' input').filestyle('clear');
	self.toggleErrorStatus('hide', tabPaneId);
	self.loading('cancel', tabPaneId);
};

/**
 * Clears all input from the "TEXT" tab pane.
 * @function
 * @param {Number} idx - the number of the tab pane
 *                       0: for left-side pane, 1: for right-side pane
 */
View.prototype.clearTabPaneTextInput = function(idx) {
	var self = this;
	var tabPaneId = '#tab-text-' + (idx + 1);
	$(tabPaneId + ' textarea').val('');
	self.toggleErrorStatus('hide', tabPaneId);
};

/**
 * Creates the node templates.
 * @function
 */
View.prototype.createTemplates = function() {
	var self = this;
	self.template.createPrintSummary(self.results.texts, self.results.uniqueMatches);
	self.template.createStatistics(self.results.texts, self.results.uniqueMatches);
	self.template.createOutputTitles(self.results.texts);
};

/**
 * Returns the ids of active tab panes as an array of strings.
 * @function
 * @returns {Array<String>} - the ids of the active tab panes
 */
View.prototype.getActiveTabPaneIds = function() {
	var self = this,
		tabPaneIds = [];
		
	$('.tab-pane.active').each(function() {
		var tabPaneId = self._getId(this);
		tabPaneIds.push(tabPaneId);
	});
	return tabPaneIds;
};

/**
 * Shows/hides an node element depending on the event specified.
 * Used to show the progress of a process (e.g. input reading).
 * @function
 * @param {String} event  - the name of the event
 * @param {Object} target - the id of the node element
 */
View.prototype.loading = function(event, target) {
	var self = this;
	
	switch (event) {
		case 'start':
			self.toggleCompareBtn('disable');
			$(target).find('.fa').addClass('hidden');
			$(target).find('.fa-spinner').removeClass('hidden');
			break;
		
		case 'done':
			self.toggleCompareBtn('enable');
			$(target).find('.fa').addClass('hidden');
			$(target).find('.fa-check').removeClass('hidden');
			break;
			
		case 'cancel':
			self.toggleCompareBtn('enable');
			$(target).find('.fa').addClass('hidden');
			break;
			
		case 'error':
			self.toggleCompareBtn('enable');
			$(target).find('.fa').addClass('hidden');
			$(target).find('.fa-times').removeClass('hidden');
			break;
			
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Resets the scroll bars.
 * @function
 */
View.prototype.resetScrollbars = function() {
	var self = this;
	self.$outputTexts.scrollTop(0);
};

/**
 * Clears text from textarea and unchecks checkboxes.
 * Important for Internet Explorer, 
 * since it does not recognize the "autocomplete='off'" attribute.
 * @function
 * @private
 */
View.prototype._resetTextInputTabPanes = function() {
	var self = this;
	self.$htmlOptions.prop('checked', false);
	self.$inputTexts.val('');
};

/**
 * Displays a warning message.
 * @function
 * @param {String} type    - the type of the message
 * @param {String} message - the text of the message
 * @param {Number} delay   - the time in milliseconds, during which the message 
 *                           should remain visible
 */
View.prototype.showAlertMessage = function(type, message, delay) {
	var self = this,
			alertMessage = self.template.createAlertMessage(type, message);
	
	self.$alertsPanel.append($(alertMessage));
	setTimeout(function() {
		self.$alertsPanel.children().eq(0).remove();
	}, delay);
};

/**
 * Appends the array of nodes returned by the comparison 
 * to the <p> node element of each output pane 
 * and shows the output panel.
 * @function
 * @param {Array} nodes - the array of nodes returned by the comparison
 */
View.prototype.showSimilarities = function(nodes) {
	var self = this,
			nLength = nodes.length;
		
	for (var i = 0; i < nLength; i++) {
		var $p = $('<p>').append(nodes[i]);
		self.$outputTextContainers.eq(i).html($p);
	}
	
	self._toggleOutputPanel('show');
	setTimeout(function() {
		self._toggleInputPanel('hide');
	}, 100);
	
	self.toggleWaitingCursor('hide');
};

/**
 * Enables/disables the compare button
 * depending on the event specified.
 * @function
 * @param {String} event - the name of the event
 */
View.prototype.toggleCompareBtn = function(event) {
	var self = this;
	switch (event) {
		case 'enable':
			self.$compareBtn.prop('disabled', false);
			break;
			
		case 'disable':
			self.$compareBtn.prop('disabled', true);
			break;
		
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Toggles the class "has-error", 
 * which applies a red border around input node elements,
 * to prompt the user in case of erroneous input.
 * @function
 * @param {String} event     - the name of the event
 * @param {String} tabPaneId - the id of the tab pane
 */
View.prototype.toggleErrorStatus = function(event, tabPaneId) {
	switch (event) {
		case 'show':
			$(tabPaneId + ' .apply-error').addClass('has-error');
			break;
		
		case 'hide':
			$(tabPaneId + ' .apply-error').removeClass('has-error');
			break;
			
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Toggles the style of the cursor (from "default" to "waiting", and vice versa)
 * depending on the event specified.
 * @function
 * @param {String} event - the name of the event
 */
View.prototype.toggleWaitingCursor = function(event) {
	switch (event) {
		case 'show':
			document.body.className = 'waiting';
			break;
		
		case 'hide':
			document.body.className = '';
			break;
			
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Updates the value of a setting in the UI.
 * @function
 * @param {String}           id    - the id of the control element 
 * @param {String}           type  - the type of the control element
 * @param {(Boolean|Number)} value - the value of the setting
 */
View.prototype.updateUIOption = function(id, type, value) {
	switch (type) {
		case 'checkbox':
			$(id).prop('checked', value);
			break;
		case 'select':
			$(id).val(value);
			break;
		default:
			$(id).val(value);
	}
};

/**
 * Calculates the height of the output pane
 * so that it fits entirely in the window.
 * @function
 * @private
 */
View.prototype._computeOutputPanelHeight = function() {
	var self = this;
	var bodyHeight = $('body').outerHeight(true);
	var outputPos  = self.$outputPanel.offset().top;
	var outputTopPadding = parseInt(self.$outputPanel.css('padding-top'), 10);
	var elemPos    = self.$outputTexts.eq(0).offset().top;
	var posOffset  = (elemPos - outputPos);
	return bodyHeight - outputPos - (posOffset + outputTopPadding);
};

/**
 * Returns the id of a node element as a string (e.g. "#id").
 * @function
 * @param   {Object} target - the id of the node element
 * @returns {String}        - the string of the node element's id 
 */
View.prototype._getId = function(target) {
	return '#' + $(target).attr('id');
};

/**
 * Returns the number contained in the id of a node element.
 * @function
 * @private
 * @param   {String} id - the id of the node element
 * @returns {Number}    - the number of the id
 */
View.prototype._getIndex = function(id) {
	var tokens = id.split('-'); 
	var idx = tokens[tokens.length - 1];
	return parseInt(idx, 10) - 1;
};

View.prototype._toggleInputPanel = function(event) {
	var self = this;
	switch (event) {
		case 'toggle':
			$('.btn-group.open').removeClass('open');
			self.$inputPanel.toggleClass('expanded');
			break;
		
		case 'hide':
			self.$inputPanel.removeClass('expanded');
			break;
		
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Shows/hides the output panel depending on the event specified.
 * @function
 * @private
 * @param {String} event - the name of the event
 */
View.prototype._toggleOutputPanel = function(event) {
	var self = this;
	switch (event) {
		case 'show':
			self.$outputPanel.removeClass('invisible');
			break;
		
		case 'hide':
			self.$outputPanel.addClass('invisible');
			break;
			
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Shows/hides the "PRINT OUTPUT" dialog depending on the event specified.
 * @function
 * @private
 * @param {String} event  - the name of the event
 * @param {Object} target - the node element to be removed
 */
View.prototype._togglePrintDialog = function(event, target) {
	var self = this;
	switch (event) {
		case 'show':
			var $printDialog = $(self.template.createPrintDialog(self.results.texts));
			self.$contentWrapper.append($printDialog);
			$printDialog.modal('show');
			break;
		
		case 'hide':
			$(target).remove();
			break;
			
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Updates the width of the alerts' panel.
 * @function
 * @private
 */
View.prototype._updateAlertsPanelWidth = function() {
	var self        = this,
			marginLR      = 3 * 2,
			navWidth      = $('nav').width(),
			navLeftWidth  = $('nav .pull-left').outerWidth(),
			navRightWidth = $('nav .pull-right').outerWidth(),
			maxWidth      = navWidth - (navLeftWidth + navRightWidth + marginLR);
		
	self.$alertsPanel.css({
		'left'      : navLeftWidth + 'px',
		'max-width' : maxWidth + 'px'
	});
};

/**
 * Updates the height of each output pane.
 * @function
 * @private
 */
View.prototype._updateOutputPanelHeight = function() {
	var self = this,
			h = self._computeOutputPanelHeight();

	self.$outputTexts.each(function() {
		$(this).css('height', h + 'px');
	});
};

module.exports = View;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../autoScroll/targetMatch.js":8}],7:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {ScrollPosition}.
 * @constructor
 * @this  {ScrollPosition}
 * @param {Number} topPadding    - the top padding
 * @param {Number} bottomPadding - the bottom padding
 * @param {Number} yPosition     - the vertical position of the scroll bar
 */
function ScrollPosition(topPadding, bottomPadding, yPosition) {
	this.topPadding    = topPadding;
	this.bottomPadding = bottomPadding;
	this.yPosition     = yPosition;
}

module.exports = ScrollPosition;

},{}],8:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $              = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
var ScrollPosition = require('./scrollPosition.js');

/**
 * Creates an instance of a {TargetMatch},
 * which hold information on the target match node element.
 * @constructor
 * @this  {TargetMatch}
 * @param {elem} elem - the source match node
 */
function TargetMatch(elem) {
	this.$srcElem             = $(elem);
	this.$srcParent           = $(this.$srcElem.parent().parent().parent());
	
	this.$elem                = $(this.$srcElem.attr('href'));
	this.$wrapper             = $(this.$elem.parent());
	this.$container           = $(this.$wrapper.parent());
	this.$parent              = $(this.$container.parent());
	
	this.parentHeight         = this.$parent[0].getBoundingClientRect().height;
	this.containerTBPadding   = parseInt(this.$container.css('padding-top'), 10) + parseInt(this.$container.css('padding-bottom'), 10);
	this.wrapperTopPadding    = parseFloat(this.$wrapper.css('padding-top'));
	this.wrapperBottomPadding = parseFloat(this.$wrapper.css('padding-bottom'));
}

/**
 * Returns the new scroll position of the target match node.
 * @function
 * @returns {ScrollPosition} - the new scroll position
 */
TargetMatch.prototype.getScrollPosition = function() {
	var self                 = this,
	    wrapperBottom        = self.$wrapper.outerHeight(true) + self.containerTBPadding,
	    wrapperTopPadding    = self.wrapperTopPadding,
	    wrapperBottomPadding = self.wrapperBottomPadding,
	    // Calculate difference on the y axis (relative to parent element)
	    yPosDiff             = (self.$srcElem.offset().top - self.$srcParent.offset().top) - (self.$elem.offset().top - self.$parent.offset().top);
	
	// Remove top padding
	if (wrapperTopPadding > 0) {
		yPosDiff += wrapperTopPadding;
		wrapperBottom -= wrapperTopPadding;
		wrapperTopPadding = 0;
	}
	
	// Remove bottom padding
	if (wrapperBottomPadding > 0) {
		wrapperBottom -= wrapperBottomPadding;
		wrapperBottomPadding = 0;
	}
	
	// Compute new scroll position
	var yScrollPos = self.$parent.scrollTop() - yPosDiff; 
	
	// Add bottom padding, if needed
	if (yScrollPos > (wrapperBottom - self.parentHeight)) {
		var bottomOffset = (yScrollPos + self.parentHeight) - (wrapperBottom);
		wrapperBottomPadding = Math.abs(bottomOffset);
	}
	
	// Add top padding, if needed
	if (yScrollPos < 0) {
		var topOffset = yScrollPos;
		wrapperTopPadding = Math.abs(topOffset);
		yScrollPos -= topOffset;
	}
	
	return new ScrollPosition(wrapperTopPadding, wrapperBottomPadding, yScrollPos);
};

/**
 * Animates scrolling to the new position.
 * @function
 * @param {ScrollPosition} scrollPosition - the new scroll position
 */
TargetMatch.prototype.scroll = function(scrollPosition) {
	var self = this;
	
	self.$wrapper.animate({
		'padding-top'    : scrollPosition.topPadding,
		'padding-bottom' : scrollPosition.bottomPadding,
	}, 700);
	
	self.$parent.animate({
		'scrollTop'      : scrollPosition.yPosition,
	}, 700);
	
};

module.exports = TargetMatch;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./scrollPosition.js":7}],9:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $     = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
var JSZip = (typeof window !== "undefined" ? window['JSZip'] : typeof global !== "undefined" ? global['JSZip'] : null);

/**
 * Creates an instance of a {FileInputReader},
 * which parses and extracts the text contents of the DOCX, ODT and TXT files.
 * @constructor
 * @this  {FileInputReader}
 * @param {File}    file            - the file selected by the user
 * @param {Boolean} ignoreFootnotes - the option for including/excluding 
 * 																		the document's footnotes from parsing
 */
function FileInputReader(file, ignoreFootnotes) {
	this.file            = file;
	this.ignoreFootnotes = ignoreFootnotes;
}

/**
 * Returns a promise that handles the file reading.
 * When resolved, the contents of the file are returned as a string. 
 * @function
 * @param   {Function} loadingStarted - the callback function 
 * 																		  for the onloadstart event
 * @returns {Promise} 
 */
FileInputReader.prototype.readFileInput = function(loadingStarted) {
	var self     = this,
			file     = self.file,
			fileType = self._getFileType(),
			deferred = $.Deferred(),
			fr       = new FileReader();
	
	fr.onerror = function(e) {
		var error = e.target.error;
		switch (error.code) {
			case error.NOT_FOUND_ERR:
				deferred.reject('File not found!');
				break;
			case error.NOT_READABLE_ERR:
				deferred.reject('File not readable.');
				break;
			case error.ABORT_ERR:
				deferred.reject('File reading aborted.');
				break;
			default:
				deferred.reject('An error occurred while reading this file.');
		}
	};
	
	fr.onloadstart = loadingStarted;
	
	switch (fileType) {
		case 'docx':
			fr.onload = function(e) {
				var docxText = self._readDOCX(e.target.result);
				
				if (docxText) {
					if (/\S/.test(docxText)) {
						deferred.resolve(docxText);
					} else {
						deferred.reject('The selected DOCX file is empty.');
					}
				} else {
					deferred.reject('The selected file is not a valid DOCX file.');
				}
			};
			fr.readAsArrayBuffer(file);
			break;
			
		case 'odt':
			fr.onload = function(e) {
				var odtText = self._readODT(e.target.result);
				
				if (odtText) {
					if (/\S/.test(odtText)) {
						deferred.resolve(odtText);
					} else {
						deferred.reject('The selected ODT file is empty.');
					}
				} else {
					deferred.reject('The selected file is not a valid ODT file.');
				}
			};
			fr.readAsArrayBuffer(file);
			break;
			
		case 'txt':
			fr.onload = function(e) {
				var txtText = e.target.result;
				
				if (txtText) {
					if (/\S/.test(txtText)) {
						// Mac uses carriage return, which is not processed correctly
						// Replace each carriage return, not followed by a line feed
						// with a line feed
						var crCleanedText = txtText.replace(/\r(?!\n)/g, '\n');
						deferred.resolve(crCleanedText);
					} else {
						deferred.reject('The selected TXT file is empty.');
					}
				}
			};
			fr.readAsText(file);
			break;
			
		default:
			deferred.reject('File type not supported.');
	}
	
	return deferred.promise();
};

/**
 * Traverses recursively all children starting from the top XML node,
 * irrespective of how deep the nesting is.
 * Returns their text contents as a string.
 * @function
 * @private
 * @param   {Object} node       - the top XML node element
 * @param   {String} tSelector  - the selector for text elements
 * @param   {String} brSelector - the selector for soft line breaks
 * @returns {String}            - the text content of the node
 */
FileInputReader.prototype._extractTextFromNode = function(node, tSelector, brSelector) {
	var self = this,
			// Paragraph selectors for both DOCX and ODT, 
			// supported both by Chrome and other browsers
			// Chrome uses different selectors 
			delimeters = {
				'w:p'    : '\n',
				'text:p' : '\n',
				'p'      : '\n'
			},
			delimeter = delimeters[node.nodeName] || '',
			str  = '';
		
	if (node.hasChildNodes()) {
		var child = node.firstChild;
		
		while (child) {
			// These selectors apply only to the footnotes of ODT files
			// Footnotes should appear all together at the end of the extracted text 
			// and not inside the text at the point where the reference is.
			if (child.nodeName === 'text:note' || child.nodeName === 'note') {
				child = child.nextSibling;
				continue;
			}
			
			if (child.nodeName === tSelector) {
				str += child.textContent;
			} else if (child.nodeName === brSelector) {
				str += '\n';
			} 
			else {
				str += self._extractTextFromNode(child, tSelector, brSelector);
			}
			
			child = child.nextSibling;
		}
	}
	
	return str + delimeter;
};

/**
 * Returns the type of file depending on the file's extension.
 * @function
 * @private
 * @param   {Object} file - the file selected by the user
 * @returns {String}      - the type of file
 */
FileInputReader.prototype._getFileType = function() {
	var self = this,
			file = self.file;
	
	if (/docx$/i.test(file.name)) {
		return 'docx';
	}
	
	if (/odt$/i.test(file.name)) {
		return 'odt';
	}
	
	if (/txt$/i.test(file.name)) {
		return 'txt';
	}
	
	return undefined;
};

/**
 * Returns the contents of all XML nodes as a string.
 * 
 * @function
 * @private
 * @param   {Object[]} nodes    - the array of XML nodes
 * @param   {String} tSelector  - the selector for text elements
 * @param   {String} brSelector - the selector for soft line breaks
 * @returns {String}            - the text content of all XML nodes
 */
FileInputReader.prototype._getTextContent = function(nodes, tSelector, brSelector) {
	var self    = this,
			nLength = nodes.length,
			textContent;
	
	for (var i = 0; i < nLength; i++) {
		var node = nodes[i];
		var nodeContent = self._extractTextFromNode(node, tSelector, brSelector);
		textContent = [textContent, nodeContent].join('');
	}
	
	return textContent;
};

/**
 * Returns the contents of the DOCX file as a string.
 * @function
 * @private
 * @param   {Object} fileContents - the contents of the file object
 * @returns {String}              - the text of the DOCX file
 */
FileInputReader.prototype._readDOCX = function(fileContents) {
	var self = this,
			document,
			footnotes  = '',
			xmlDoc,
			tSelector  = 'w:t',
			brSelector = 'w:br',
			zip;

	// Unzip the file
	try {
		zip = new JSZip(fileContents);
	
		// Read the main text of the DOCX file
		var file = zip.files['word/document.xml'];
			
		if (file) {
			xmlDoc = $.parseXML(file.asText());
			var pNodes = $(xmlDoc).find('w\\:body, body').children();
			document = self._getTextContent(pNodes, tSelector, brSelector);
		}
		
		// Read footnotes/endnotes
		if (!self.ignoreFootnotes) {
			// Read footnotes
			file = zip.files['word/footnotes.xml'];
			if (file) {
				xmlDoc = $.parseXML(file.asText());
				var fNodes = $(xmlDoc).find('w\\:footnotes, footnotes').children('w\\:footnote:not([w\\:type]), footnote:not([type])');
				var fNodesText = self._getTextContent(fNodes, tSelector, brSelector);
				if (fNodesText) {
					footnotes = [footnotes, fNodesText].join('');
				}
			}
			
			// Read endnotes
			file = zip.files['word/endnotes.xml'];
			if (file) {
				xmlDoc = $.parseXML(file.asText());
				var eNodes = $(xmlDoc).find('w\\:endnotes, endnotes').children('w\\:endnote:not([w\\:type]), endnote:not([type])');
				var eNodesText = self._getTextContent(eNodes, tSelector, brSelector);
				if (eNodesText) {
					footnotes = [footnotes, eNodesText].join('');
				}
			}
			
			if (footnotes && footnotes.length) {
				document = [document, 'FOOTNOTES', footnotes].join('\n'); 
			}
		}
	} catch (error) {
		
	}
	
	return document;
};

/**
 * Returns the contents of the ODT file as a string.
 * @function
 * @private
 * @param   {Object} fileContents - the contents of the file object
 * @returns {String}              - the text of the ODT file
 */
FileInputReader.prototype._readODT = function(fileContents) {
	var self = this,
			document, 
			tSelector  = '#text', 
			brSelector = 'text:line-break',
			zip;
	
	// Unzip the file
	try {
		zip = new JSZip(fileContents);

		// Read the main text, as well as the footnotes/endnotes of the ODT file
		var file = zip.files['content.xml'];
		
		if (file) {
			var xmlDoc = $.parseXML(file.asText());
			var pNodes = $(xmlDoc).find('office\\:body, body').children();
			document = self._getTextContent(pNodes, tSelector, brSelector);
			
			if (!self.ignoreFootnotes) {
				var fNodes = $(pNodes).find('text\\:note-body, note-body');
				var footnotes = self._getTextContent(fNodes, tSelector, brSelector);
				
				if (footnotes && footnotes.length) {
					document = [document, 'FOOTNOTES', footnotes].join('\n'); 
				}
			}
		}
	} catch (error) {
		
	}
	
	return document;
};

module.exports = FileInputReader;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $       = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
var XRegExp = (typeof window !== "undefined" ? window['XRegExp'] : typeof global !== "undefined" ? global['XRegExp'] : null);

/**
 * Creates an instance of a {TextInputReader},
 * which parses and extracts the text contents of the HTML text input.
 * @constructor
 * @this {TextInputReader}
 */
function TextInputReader() {
}

/**
 * Returns a promise that handles the HTML input reading.
 * When resolved, the contents of the HTML text
 * are returned as a string. 
 * @function
 * @param   {String} text - the HTML text input
 * @returns {Promise}
 */
TextInputReader.prototype.readTextInput = function(text) {
	var self     = this,
			deferred = $.Deferred();
		
	var cleanedText = '';
	var div = document.createElement('div');
	div.innerHTML = text;

	var textNode = self._extractTextFromNode(div);
	// If is not empty or not contains only white spaces
	if (textNode.length && /\S/.test(textNode)) {
		cleanedText = [cleanedText, textNode].join('');
		// Remove multiple white spaces
		cleanedText = cleanedText.replace(/\n[ \t\v]*/g, '\n');
		// Remove multiple newlines
		cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
		
		// Resolve
		deferred.resolve(cleanedText);
	} else {
		// Reject
		deferred.reject('HTML input has no valid text contents.');
	}
		
	return deferred.promise();
};

/**
 * Traverses recursively all child nodes, 
 * irrespective of how deep the nesting is.
 * Returns the HTML text contents as a string.
 * @function
 * @private
 * @param   {Object} node - the parent HTML node element
 * @returns {String}      - the text content of the HTML string
 */
TextInputReader.prototype._extractTextFromNode = function(node) {
	var self = this,
			// Match any letter
			letterRegex = XRegExp('^\\pL+$'),
			str = '';
	
	// Returns whether a node should be skipped
	var isValidNode = function(nodeName) {
		var skipNodes       = ['IFRAME', 'NOSCRIPT', 'SCRIPT', 'STYLE'],
				skipNodesLength = skipNodes.length;
			
		for (var i = 0; i < skipNodesLength; i++) {
			if (nodeName === skipNodes[i]) {
				return false;
			}
		}
		return true; 
	};
	
	if (isValidNode(node.nodeName) && node.hasChildNodes()) {
		var child = node.firstChild;
		
		while (child) {
			// If text node
			if (child.nodeType === 3) {
				var content = child.textContent;
				if (content.length) {
					str += content;
				}
			} else {
				var extractedContent = self._extractTextFromNode(child);
				// Add a space between text nodes that are not separated 
				// by a space or newline (e.g. as in lists)
				if (letterRegex.test(str[str.length - 1]) && letterRegex.test(extractedContent[0])) {
					str += ' ';
				}
				str += extractedContent;
			}
			
			child = child.nextSibling;
		}
	}
	
	return str;
};

module.exports = TextInputReader;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],11:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $   = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
var App = require('./app/app.js');

// Main execution entry point
$(window).load(function() {
	setTimeout(function() {
		$(".loader").addClass('shrinked');
		var app = new App('simtexter');
	}, 700);
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./app/app.js":1}],12:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Records a match found in the source and the target text.
 * @constructor
 * @this  {Match}
 * @param {Number} srcTxtIdx     - the index of the source text 
 * 																 in {SimTexter.texts[]}, where the match 
 * 																 is found
 * @param {Number} srcTkBeginPos - the index of the source text's token 
 * 																 in {SimTexter.tokens[]}, where the match 
 * 																 starts 
 * @param {Number} trgTxtIdx     - the index of the target text
 * 																 in {SimTexter.texts[]}, where the match 
 * 																 is found
 * @param {Number} trgTkBeginPos - the index of the target text's token 
 * 																 in {SimTexter.tokens[]}, where the match 
 * 																 starts
 * @param {Number} matchLength   - the length of the match 
 */
function Match(srcTxtIdx, srcTkBeginPos, trgTxtIdx, trgTkBeginPos, matchLength) {
	this.srcTxtIdx     = srcTxtIdx;
	this.srcTkBeginPos = srcTkBeginPos;
	this.trgTxtIdx     = trgTxtIdx;
	this.trgTkBeginPos = trgTkBeginPos;
	this.matchLength   = matchLength;
}

module.exports = Match;

},{}],13:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Records a match found in a text.
 * @constructor
 * @this  {MatchSegment}
 * @param {Number} txtIdx      - the index of the text in {SimTexter.texts[]},
 * 															 where the match has been found
 * @param {Number} tkBeginPos  - the index of the token in {SimTexter.tokens[]},
 * 															 where the match starts 
 * @param {Number} matchLength - the length of the match
 */
function MatchSegment(txtIdx, tkBeginPos, matchLength) {
	this.txtIdx      = txtIdx;
	this.tkBeginPos  = tkBeginPos;
	this.matchLength = matchLength;
	this.styleClass  = undefined;
}

/**
 * Returns the match's link node.
 * @function
 * @param {String}       text            - the text content of the node 
 * @param {MatchSegment} trgMatchSegment - the target match segment
 * @returns                              - the match's link node
 */
MatchSegment.prototype.createLinkNode = function(text, trgMatchSegment) {
	var self = this,
    	matchLink = document.createElement('a');
    	
    matchLink.id          = [self.txtIdx + 1, '-', self.tkBeginPos].join('');
    matchLink.className   = self.styleClass;
    matchLink.href        = ['#', trgMatchSegment.txtIdx+1, '-', trgMatchSegment.tkBeginPos].join('');
    matchLink.textContent = text;
    return matchLink;
};

/**
 * Returns the index of the token in {SimTexter.tokens[]},
 * where the match ends.
 * @function
 * @returns {Number} - the last token position of the match (non-inclusive)
 */
MatchSegment.prototype.getTkEndPosition = function() {
	var self = this;
	return self.tkBeginPos + self.matchLength;
};

/**
 * Returns the index of the character in the input string,
 * where the match starts.
 * @function
 * @returns {Number} - the first character of the match in the input string 
 */
MatchSegment.prototype.getTxtBeginPos = function(tokens) {
	var self = this;
    return tokens[self.tkBeginPos].txtBeginPos;
};

/**
 * Returns the index of the character in the input string,
 * where the match ends.
 * @function
 * @returns {Number} - the last character of the match in the input string 
 */
MatchSegment.prototype.getTxtEndPos = function(tokens) {
	var self = this;
    return tokens[self.tkBeginPos + self.matchLength - 1].txtEndPos;
};

/**
 * Sets the style class of the match segment.
 * @function
 * @param {(Number|String)} n - the style class to be applied
 */
MatchSegment.prototype.setStyleClass = function(n) {
	var self = this;
	if (typeof n === 'number') {
		self.styleClass = ['hl-', n % 10].join('');
	}
	
	if (typeof n === 'string') {
		self.styleClass = n;
	}
};

module.exports = MatchSegment;

},{}],14:[function(require,module,exports){
(function (global){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $            = (typeof window !== "undefined" ? window['$'] : typeof global !== "undefined" ? global['$'] : null);
var XRegExp      = (typeof window !== "undefined" ? window['XRegExp'] : typeof global !== "undefined" ? global['XRegExp'] : null);
var Match        = require('./match.js');
var MatchSegment = require('./matchSegment.js');
var Text         = require('./text.js');
var Token        = require('./token.js');

/**
 * Creates an instance of {SimTexter}.
 * @constructor
 * @param {this}        SimTexter
 * @param {Object}      storage   - the object that holds the app's settings
 */
function SimTexter(storage) {
	this.ignoreLetterCase  = storage.getItemValueByKey('ignoreLetterCase');
	this.ignoreNumbers     = storage.getItemValueByKey('ignoreNumbers');
	this.ignorePunctuation = storage.getItemValueByKey('ignorePunctuation');
	this.replaceUmlaut     = storage.getItemValueByKey('replaceUmlaut');
	this.minMatchLength    = storage.getItemValueByKey('minMatchLength');
	
	this.texts             = [];
	this.tokens            = [new Token()];
	this.uniqueMatches     = 0;
}

/**
 * Returns a promise that handles the comparison process.
 * When resolved, an array of nodes is returned,
 * which holds the text and the highlighted matches.
 * @function
 * @param {Array<InputText>} inputTexts - the array of {InputText} objects 
 *                                        which hold information about the user 
 * 																 				input
 */
SimTexter.prototype.compare = function(inputTexts) {
	var self     = this,
			deferred = $.Deferred(),
			forwardReferences = [],
			similarities = [];
	
		// Read input (i.e. cleaning, tokenization)
		self._readInput(inputTexts, forwardReferences);
		// Get matches
		similarities = self._getSimilarities(0, 1, forwardReferences);

		if (similarities.length) {
			// Return input string as HTML nodes
			deferred.resolve(self._getNodes(inputTexts, similarities));
		} else {
			deferred.reject('No similarities found.');
		}
	
	return deferred.promise();
};

/**
 * Applies a style class to each match segment
 * and removes duplicates from the array of matches.
 * Duplicates or overlapping segments can be traced,
 * if one observes the target {MatchSegment} objects 
 * stored in the array matches.
 * Sorting of matches by target {MatchSegment}, 
 * with its tkBeginPos in ascending order 
 * and its matchLength in descending order,
 * makes removal of duplicates easy to handle.
 * The first {MatchSegment} with a given tkBeginPos
 * has the longest length. All others with the same tkBeginPos
 * have the same or a smaller length, and thus can be discarded.
 * @function
 * @private
 * @param   {Array} matches - the array that holds the match segments, 
 * 														stored in pairs
 * @returns {Array}         - the array of unique matches
 */
SimTexter.prototype._applyStyles = function(matches) {
	var self = this;
	
	// Sort matches by target {MatchSegment},
	// where tkBeginPos in ascending order and matchLength in descending order
	var sortedMatches = self._sortSimilarities(matches, 1);
	var sortedMatchesLength = sortedMatches.length;
	var styleClassCnt = 1;
	
	// Add first match in array of unique matches to have a starting point
	var uniqueMatch = [sortedMatches[0][0], sortedMatches[0][1]];
	uniqueMatch[0].setStyleClass(0);
	uniqueMatch[1].setStyleClass(0);
	var aUniqueMatches = [uniqueMatch];

	// For each match in sortedMatches[]
	for (var i = 1; i < sortedMatchesLength; i++) {
		var lastUniqueMatch = aUniqueMatches[aUniqueMatches.length - 1][1];
		var match = sortedMatches[i][1];
		
		// If not duplicate
		if (lastUniqueMatch.tkBeginPos != match.tkBeginPos) {
			// if not overlapping
			if (lastUniqueMatch.getTkEndPosition() - 1 < match.tkBeginPos) {
				uniqueMatch = [sortedMatches[i][0], sortedMatches[i][1]];
				uniqueMatch[0].setStyleClass(styleClassCnt);
				uniqueMatch[1].setStyleClass(styleClassCnt);
				aUniqueMatches.push(uniqueMatch);
				styleClassCnt++;
			} else {
				// end-to-start overlapping
				// end of lastUniqueMatch overlaps with start of match
				if (lastUniqueMatch.getTkEndPosition() < match.getTkEndPosition()) {
					var styleClass = ( /overlapping$/.test(lastUniqueMatch.styleClass) ) ? lastUniqueMatch.styleClass : lastUniqueMatch.styleClass + ' overlapping';
					// Overwrite the style of the last unique match segment 
					// and change its length accordingly
					aUniqueMatches[aUniqueMatches.length - 1][0].setStyleClass(styleClass);
					aUniqueMatches[aUniqueMatches.length - 1][1].setStyleClass(styleClass);
					aUniqueMatches[aUniqueMatches.length - 1][1].matchLength = match.tkBeginPos - lastUniqueMatch.tkBeginPos;
					
					// Add the new match segment
					uniqueMatch = [sortedMatches[i][0], sortedMatches[i][1]];
					uniqueMatch[0].setStyleClass(styleClass);
					uniqueMatch[1].setStyleClass(styleClass);
					aUniqueMatches.push(uniqueMatch);
				}
			}
		} 
	}

	self.uniqueMatches = aUniqueMatches.length;
	return aUniqueMatches;
};

/**
 * Returns a regular expression depending on the comparison options set.
 * Uses the XRegExp category patterns.
 * @function
 * @private
 * @returns {XRegExp} - the regular expression
 */
SimTexter.prototype._buildRegex = function() {
	var self = this,
			// XRegExp patterns
			NUMBERS     = '\\p{N}',
			PUNCTUATION = '\\p{P}',		
			regex       = '';
	
	if (self.ignoreNumbers) {
		regex += NUMBERS;
	}
	
	if (self.ignorePunctuation) {
		regex += PUNCTUATION;
	}
		
	return (regex.length > 0) ? XRegExp('[' + regex + ']', 'g') : undefined;
};

/**
 * Cleans the input string according to the comparison options set.
 * @function
 * @private
 * @param   {String} inputText - the input string
 * @returns {String}           - the cleaned input string
 */
SimTexter.prototype._cleanInputText = function(inputText) {
	var self = this,
			text = inputText;
			
	var langRegex = self._buildRegex();
	
	if (langRegex) {
		text = inputText.replace(langRegex, ' ');
	}
	
	if (self.ignoreLetterCase) {
		text = text.toLowerCase();
	}
	
	return text;
};

/**
 * Returns a "cleaned" word, according to the comparison options set.
 * @function
 * @private
 * @param   {String} word - a sequence of characters, separated by one 
 *                          or more white space characters (space, tab, newline)
 * @returns {String}      - the cleaned word
 */
SimTexter.prototype._cleanWord = function(word) {
	var self = this,
			umlautRules = {
				'ä': 'ae',
		  	'ö': 'oe',
		  	'ü': 'ue',
		  	'ß': 'ss',
		  	'æ': 'ae',
		  	'œ': 'oe',
		  	'Ä': 'AE',
		  	'Ö': 'OE',
		  	'Ü': 'UE',
		  	'Æ': 'AE',
		  	'Œ': 'OE'
			},
			token = word;
	
	if (self.replaceUmlaut) {
		token = word.replace(/ä|ö|ü|ß|æ|œ|Ä|Ö|Ü|Æ|Œ/g, function(key){
			return umlautRules[key];
		});
	}
	
	return token;
};

/**
 * Finds the longest common substring in the source and the target text
 * and returns the best match.
 * @function
 * @private
 * @param   {Number} srcTxtIdx     - the index of the source text in texts[] 
 *                                   to be compared
 * @param   {Number} trgTxtIdx     - the index of the target text in texts[] 
 *                                   to be compared
 * @param   {Number} srcTkBeginPos - the index of the token in tokens[] 
 *                                   at which the comparison should start
 * @param   {Array}  frwReferences - the array of forward references
 * @returns {Match}                - the best match
 */
SimTexter.prototype._getBestMatch = function(srcTxtIdx, trgTxtIdx, srcTkBeginPos, frwReferences) {
	var self = this,
			bestMatch,
			bestMatchTkPos,
			bestMatchLength = 0,
			srcTkPos = 0,
			trgTkPos = 0;
	
	for ( var tkPos = srcTkBeginPos;
		  (tkPos > 0) && (tkPos < self.tokens.length);
		  tkPos = frwReferences[tkPos]                   ) {
		
		// If token not within the range of the target text  
		if (tkPos < self.texts[trgTxtIdx].tkBeginPos) {
			continue;
		}
		
		var minMatchLength = (bestMatchLength > 0) ? bestMatchLength + 1 : self.minMatchLength;
		
		srcTkPos = srcTkBeginPos + minMatchLength - 1;
		trgTkPos = tkPos + minMatchLength - 1;
		
		// Compare backwards
		if ( srcTkPos < self.texts[srcTxtIdx].tkEndPos &&
				 trgTkPos < self.texts[trgTxtIdx].tkEndPos && 
			 	 (srcTkPos + minMatchLength) <= trgTkPos      ) { // check if they overlap
			var cnt = minMatchLength;
			
			while (cnt > 0 && self.tokens[srcTkPos].text === self.tokens[trgTkPos].text) {
				srcTkPos--;
				trgTkPos--;
				cnt--;
			}
			
			if (cnt > 0) {
				continue;
			}
		} else {
			continue;
		}
		
		// Compare forwards
		var newMatchLength = minMatchLength;
		srcTkPos = srcTkBeginPos + minMatchLength;
		trgTkPos = tkPos + minMatchLength;
		
		while ( srcTkPos < self.texts[srcTxtIdx].tkEndPos &&
						trgTkPos < self.texts[trgTxtIdx].tkEndPos && 
						(srcTkPos + newMatchLength) < trgTkPos    && // check if they overlap
						self.tokens[srcTkPos].text === self.tokens[trgTkPos].text ) {
			srcTkPos++;
			trgTkPos++;
			newMatchLength++;
		}
		
		// Record match
		if (newMatchLength >= self.minMatchLength && newMatchLength > bestMatchLength) {
			bestMatchLength = newMatchLength;
			bestMatchTkPos  = tkPos;
			bestMatch = new Match(srcTxtIdx, srcTkBeginPos, trgTxtIdx, bestMatchTkPos, bestMatchLength);
		}
	}
			
	return bestMatch;
};

/**
 * Returns an array of HTML nodes, containing the whole text, 
 * together with the hightlighted matches.
 * The text content of each node is retrieved by slicing the input text
 * at the first (txtBeginPos) and the last (txtEndPos) character position 
 * of each match.
 * @function
 * @private
 * @param   {Array} inputTexts - the array of {InputText} objects, 
 * 															 which hold information about each user input
 * @param   {Array} matches    - the array that holds the {MatchSegment} objects, 
 * 															 stored in pairs
 * @returns {Array}            - the array of HTML nodes, 
 * 															 which holds the text and the highlighted matches
 */
SimTexter.prototype._getNodes = function(inputTexts, matches) {
	var self = this,
			iTextsLength = inputTexts.length,
			nodes = [];
	
	var styledMatches = self._applyStyles(matches);
		
	// For each input text
	for (var i = 0; i < iTextsLength; i++) {
		var inputText = inputTexts[i].text,
				chIdx = 0,
				chIdxLast = chIdx,
				chEndPos = inputText.length,
				mIdx = 0,
				trgIdxRef = (i == 0) ? (i + 1) : (i - 1);
				nodes[i] = [];
		
		// Sort array of similarities
		var sortedMatches = self._sortSimilarities(styledMatches, i);

		// For each character position in input text
		while (chIdx <= chEndPos) {
			if (sortedMatches.length && mIdx < sortedMatches.length) {
				var match = sortedMatches[mIdx][i];
				// Get start character position of match segment
				var mTxtBeginPos = match.getTxtBeginPos(self.tokens);
				// Get end character position of match segment
				var mTxtEndPos = match.getTxtEndPos(self.tokens);
				
				// Create text node
				var textNodeStr = inputText.slice(chIdxLast, mTxtBeginPos);
				var textNode = document.createTextNode(textNodeStr);
				nodes[i].push(textNode);
				
				// Create link node for match segment
				var linkNodeStr = inputText.slice(mTxtBeginPos, mTxtEndPos);
				var linkNode = match.createLinkNode(linkNodeStr, sortedMatches[mIdx][trgIdxRef]);
				nodes[i].push(linkNode);
				
				mIdx++;
				chIdx = mTxtEndPos;
				chIdxLast = chIdx;
			} else {
				var lastTextNodeStr = inputText.slice(chIdxLast, chEndPos);
				var lastTextNode = document.createTextNode(lastTextNodeStr);
				nodes[i].push(lastTextNode);
				chIdx = chEndPos;
				break;
			}
			chIdx++;
		}
	}
	
	return nodes;
};

/**
 * Returns an array of matches,
 * where each match is an array of two {MatchSegment} objects, stored in pairs.
 * At index 0, the source {MatchSegment} object is stored,
 * and at index 1, the target {MatchSegment} object.
 * @function
 * @param   {Number} srcTxtIdx     - the index of the source {Text} object 
 * 																	 in texts[] to be compared
 * @param   {Number} trgTxtIdx     - the index of the target {Text} object 
 * 																	 in texts[] to be compared
 * @param   {Array}  frwReferences - the array of forward references
 * @returns {Array}                - the array that holds the {MatchSegment} 
 * 																 	 objects, stored in pairs
 */
SimTexter.prototype._getSimilarities = function(srcTxtIdx, trgTxtIdx, frwReferences) {
	var self         = this,
			similarities = [],
			srcTkPos     = self.texts[srcTxtIdx].tkBeginPos,
			srcTkEndPos  = self.texts[srcTxtIdx].tkEndPos;

	while ((srcTkPos + self.minMatchLength) <= srcTkEndPos) {
		var bestMatch = self._getBestMatch(srcTxtIdx, trgTxtIdx, srcTkPos, frwReferences);

		if (bestMatch && bestMatch.matchLength > 0) {
			similarities.push([
					new MatchSegment(bestMatch.srcTxtIdx, bestMatch.srcTkBeginPos, bestMatch.matchLength), 
					new MatchSegment(bestMatch.trgTxtIdx, bestMatch.trgTkBeginPos, bestMatch.matchLength)
				]);
			srcTkPos += bestMatch.matchLength;
		} else {
			srcTkPos++;
		}
	}
	
	return similarities;
};

/**
 * Creates the forward reference table.
 * @function
 * @private
 * @param {Text}   text          - a {Text} object
 * @param {Array}  frwReferences - the array of forward references 
 * @param {Object} mtsTags       - the hash table of minMatchLength 
 * 																 sequence of tokens (MTS)
 */
SimTexter.prototype._makeForwardReferences = function(text, frwReferences, mtsTags) {
	var	self      = this,
		txtBeginPos = text.tkBeginPos,
		txtEndPos   = text.tkEndPos;
		
	// For each token in tokens[]
	for (var i = txtBeginPos; (i + self.minMatchLength - 1) < txtEndPos; i++) {
		// Concatenate tokens of minimum match length
		var tag = self.tokens.slice(i, i + self.minMatchLength).map(function(token) {
			return token.text;
		}).join('');

		// If hash table contains tag
		if (tag in mtsTags) {
			// Store current token position at index mtsTags[tag]
			frwReferences[mtsTags[tag]] = i;
		}
		// Add tag to hash table and assign current token position to it
		mtsTags[tag] = i;
	}
};

/**
 * Reads the input string, and initializes texts[] and tokens[].
 * Creates also the forward reference table.
 * @function
 * @private
 * @param {Array} inputTexts    - the array of {InputText} objects
 * 															  that hold information on the user input
 * @param {Array} frwReferences - the array of forward references
 */
SimTexter.prototype._readInput = function(inputTexts, frwReferences) {
	var self         = this,
	    mtsHashTable = {},
	    iLength      = inputTexts.length;
		
	for (var i = 0; i < iLength; i++) {
		var inputText = inputTexts[i];
		// Compute text's words
		var nrOfWords = inputText.text.match(/[^\s]+/g).length;
		// Initialize texts[]
		self.texts.push(new Text(inputText.mode, inputText.text.length, nrOfWords, inputText.fileName, self.tokens.length));
		// Initialize tokens[]
		self._tokenizeInput(inputText.text);
		// Update text's last token position
		self.texts[i].tkEndPos = self.tokens.length;
		// Create array of forward references
		self._makeForwardReferences(self.texts[i], frwReferences, mtsHashTable);
	}
};

/**
 * Sorts matches by source or target {MatchSegment},
 * depending on the idx value.
 * @function
 * @private
 * @param   {Array}  matches - the array of matches to be sorted
 * @param   {Number} idx     - the index of the array of 
 * 														 the {MatchSegment} objects
 * @returns {Array}          - the sorted array of matches
 */
SimTexter.prototype._sortSimilarities = function(matches, idx) {
	var sortedSims = matches.slice(0);
	
	sortedSims.sort(function(a, b) {
		var pos = a[idx].tkBeginPos - b[idx].tkBeginPos;
		if (pos) {
			return pos;
		}
		return b[idx].matchLength - a[idx].matchLength;
	});
	
	return sortedSims;
};

/**
 * Tokenizes the input string.
 * @param {Object} inputText - the input string to be tokenized
 */
SimTexter.prototype._tokenizeInput = function(inputText) {
	var self        = this,
		  wordRegex = /[^\s]+/g,
		  match;
	
	var cleanedText = self._cleanInputText(inputText);
		
	while (match = wordRegex.exec(cleanedText)) {
		var word = match[0];
		var token = self._cleanWord(word);
		
		if (token.length > 0) {
			var txtBeginPos = match.index;
			var txtEndPos   = match.index + word.length;
			// Add token to tokens[]
			self.tokens.push(new Token(token, txtBeginPos, txtEndPos));
		}
	}
};

module.exports = SimTexter;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./match.js":12,"./matchSegment.js":13,"./text.js":15,"./token.js":16}],15:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {Text},
 * which holds information on the input string.
 * @constructor
 * @this  {Text}
 * @param {String} inputMode      - the mode of the input (i.e. 'File' 
 * 																 	or 'Text')
 * @param {Number} nrOfCharacters - the total number of characters 
 * 																 	of the input string
 * @param {Number} nrOfWords      - the total number of words 
 * 																 	of the input string
 * @param {String} fileName       - the name of the file
 * @param {Number} tkBeginPos     - the index (inclusive) of the token
 * 																	in {SimTexter.tokens[]}, at which 
 * 																 	the input string starts 
 * @param {Number} tkEndPos       - the index (non-inclusive) of the token
 * 																  in {SimTexter.tokens[]}, at which 
 * 																 	the input string ends 
 */
function Text(inputMode, nrOfCharacters, nrOfWords, fileName, tkBeginPos, tkEndPos) {
	this.inputMode      = inputMode;
	this.fileName       = fileName;
	this.tkBeginPos     = tkBeginPos     || 0;
	this.tkEndPos       = tkEndPos       || 0;
	this.nrOfCharacters = nrOfCharacters || 0;
	this.nrOfWords      = nrOfWords      || 0;
}

module.exports = Text;

},{}],16:[function(require,module,exports){
/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {Token}.
 * A {Token} records the starting and ending character position 
 * of a word in the input string, to facilitate reconstruction of the input
 * during output of the comparison results.
 * A word is a sequence of characters, 
 * separated by one or more whitespaces or newlines.
 * The text of the {Token} corresponds to the "cleaned" version of a word. 
 * All characters, as defined by the comparison options set by the user,
 * are removed/replaced from the token's text.
 * @constructor
 * @this  {Token}
 * @param {String} text        - the text of the word after being "cleaned" 
 *                               according to the comparison options 
 *                               set by the user 
 * @param {Number} txtBeginPos - the index of the word's first character 
 * 															 (inclusive) in the input string
 * @param {Number} txtEndPos   - the index of the word's last character 
 * 															 (non-inclusive) in the input string
 */
function Token(text, txtBeginPos, txtEndPos) {
	this.text        = text        || '';
	this.txtBeginPos = txtBeginPos || 0;
	this.txtEndPos   = txtEndPos   || 0;
}

module.exports = Token;

},{}]},{},[11])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvYXBwL2FwcC5qcyIsInNyYy9qcy9hcHAvY29udHJvbGxlci5qcyIsInNyYy9qcy9hcHAvaW5wdXRUZXh0LmpzIiwic3JjL2pzL2FwcC9zdG9yYWdlLmpzIiwic3JjL2pzL2FwcC90ZW1wbGF0ZS5qcyIsInNyYy9qcy9hcHAvdmlldy5qcyIsInNyYy9qcy9hdXRvU2Nyb2xsL3Njcm9sbFBvc2l0aW9uLmpzIiwic3JjL2pzL2F1dG9TY3JvbGwvdGFyZ2V0TWF0Y2guanMiLCJzcmMvanMvaW5wdXRSZWFkZXIvZmlsZUlucHV0UmVhZGVyLmpzIiwic3JjL2pzL2lucHV0UmVhZGVyL3RleHRJbnB1dFJlYWRlci5qcyIsInNyYy9qcy9tYWluLmpzIiwic3JjL2pzL3NpbXRleHRlci9tYXRjaC5qcyIsInNyYy9qcy9zaW10ZXh0ZXIvbWF0Y2hTZWdtZW50LmpzIiwic3JjL2pzL3NpbXRleHRlci9zaW10ZXh0ZXIuanMiLCJzcmMvanMvc2ltdGV4dGVyL3RleHQuanMiLCJzcmMvanMvc2ltdGV4dGVyL3Rva2VuLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDalVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNoTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3cEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNwVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQy9mQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIGpzaGludCB1bmRlZjp0cnVlLCB1bnVzZWQ6dHJ1ZSwgbm9kZTp0cnVlLCBicm93c2VyOnRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyIENvbnRyb2xsZXIgPSByZXF1aXJlKCcuL2NvbnRyb2xsZXIuanMnKTtcbnZhciBTdG9yYWdlICAgID0gcmVxdWlyZSgnLi9zdG9yYWdlLmpzJyk7XG52YXIgVGVtcGxhdGUgICA9IHJlcXVpcmUoJy4vdGVtcGxhdGUuanMnKTtcbnZhciBWaWV3ICAgICAgID0gcmVxdWlyZSgnLi92aWV3LmpzJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBpbnN0YW5jZSBvZiB0aGUgYXBwbGljYXRpb24uXG4gKiBAY29uc3RydWN0b3JcbiAqIEB0aGlzICB7QXBwfVxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZSAtIHRoZSBuYW1lc3BhY2Ugb2YgdGhlIGFwcCAoaS5lLiBcInNpbXRleHRlclwiKVxuICovXG5mdW5jdGlvbiBBcHAobmFtZXNwYWNlKSB7XG5cdC8vIEFwcCdzIGRlZmF1bHQgc2V0dGluZ3MgKGNvbXBhcmlzb24gJiBpbnB1dCByZWFkaW5nIG9wdGlvbnMpXG5cdHZhciBkZWZhdWx0cyA9IHtcblx0XHRcdCdtaW5NYXRjaExlbmd0aCcgICAgOiB7IGlkOiAnI21pbi1tYXRjaC1sZW5ndGgnLCAgIHR5cGU6ICdpbnB1dFRleHQnLCB2YWx1ZTogNCAgICAgfSxcblx0XHRcdCdpZ25vcmVGb290bm90ZXMnICAgOiB7IGlkOiAnI2lnbm9yZS1mb290bm90ZXMnLCAgIHR5cGU6ICdjaGVja2JveCcsICB2YWx1ZTogZmFsc2UgfSxcblx0XHRcdCdpZ25vcmVMZXR0ZXJDYXNlJyAgOiB7IGlkOiAnI2lnbm9yZS1sZXR0ZXItY2FzZScsIHR5cGU6ICdjaGVja2JveCcsICB2YWx1ZTogdHJ1ZSAgfSxcblx0XHRcdCdpZ25vcmVOdW1iZXJzJyAgICAgOiB7IGlkOiAnI2lnbm9yZS1udW1iZXJzJywgICAgIHR5cGU6ICdjaGVja2JveCcsICB2YWx1ZTogZmFsc2UgfSxcblx0XHRcdCdpZ25vcmVQdW5jdHVhdGlvbicgOiB7IGlkOiAnI2lnbm9yZS1wdW5jdHVhdGlvbicsIHR5cGU6ICdjaGVja2JveCcsICB2YWx1ZTogdHJ1ZSAgfSxcblx0XHRcdCdyZXBsYWNlVW1sYXV0JyAgICAgOiB7IGlkOiAnI3JlcGxhY2UtdW1sYXV0JywgICAgIHR5cGU6ICdjaGVja2JveCcsICB2YWx1ZTogdHJ1ZSAgfVxuXHRcdH07XG5cdFxuXHR0aGlzLnN0b3JhZ2UgICAgPSBuZXcgU3RvcmFnZShuYW1lc3BhY2UsIGRlZmF1bHRzKTtcblx0dGhpcy50ZW1wbGF0ZSAgID0gbmV3IFRlbXBsYXRlKCk7XG5cdHRoaXMudmlldyAgICAgICA9IG5ldyBWaWV3KHRoaXMudGVtcGxhdGUpO1xuXHR0aGlzLmNvbnRyb2xsZXIgPSBuZXcgQ29udHJvbGxlcih0aGlzLnN0b3JhZ2UsIHRoaXMudmlldyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQXBwOyIsIi8qIGpzaGludCB1bmRlZjp0cnVlLCB1bnVzZWQ6dHJ1ZSwgbm9kZTp0cnVlLCBicm93c2VyOnRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyICQgICAgICAgICAgICAgICA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcbnZhciBGaWxlSW5wdXRSZWFkZXIgPSByZXF1aXJlKCcuLi9pbnB1dFJlYWRlci9maWxlSW5wdXRSZWFkZXIuanMnKTtcbnZhciBJbnB1dFRleHQgICAgICAgPSByZXF1aXJlKCcuL2lucHV0VGV4dC5qcycpO1xudmFyIFNpbVRleHRlciAgICAgICA9IHJlcXVpcmUoJy4uL3NpbXRleHRlci9zaW10ZXh0ZXIuanMnKTtcbnZhciBUZXh0SW5wdXRSZWFkZXIgPSByZXF1aXJlKCcuLi9pbnB1dFJlYWRlci90ZXh0SW5wdXRSZWFkZXIuanMnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIGEge0NvbnRyb2xsZXJ9LCBcbiAqIHdoaWNoIGhhbmRsZXMgdXNlciBpbnRlcmFjdGlvbiAoZGF0YSByZWFkaW5nLCBpbnB1dCBjb250cm9sLCBjb21wYXJpc29uKS5cbiAqIEludGVyYWN0cyB3aXRoIHRoZSB7Vmlld30gb2JqZWN0IHRvIHJlbmRlciB0aGUgZmluYWwgb3V0cHV0LlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge0NvbnRyb2xsZXJ9XG4gKiBAcGFyYW0ge1N0b3JhZ2V9IHN0b3JhZ2UgLSB0aGUgb2JqZWN0IHRoYXQgaG9sZHMgdGhlIGFwcCdzIHNldHRpbmdzIFxuICogQHBhcmFtIHtWaWV3fSAgICB2aWV3ICAgIC0gdGhlIGFwcCdzIHZpZXdcbiAqL1xuZnVuY3Rpb24gQ29udHJvbGxlcihzdG9yYWdlLCB2aWV3KSB7XG5cdHRoaXMuc3RvcmFnZSAgICAgICAgICAgICAgPSBzdG9yYWdlO1xuXHR0aGlzLnZpZXcgICAgICAgICAgICAgICAgID0gdmlldztcblx0dGhpcy5tYXhDaGFyYWN0ZXJzUGVyUGFnZSA9IDE5MDA7XG5cdHRoaXMubWF4TnVtYmVyT2ZQYWdlcyAgICAgPSA1MDA7XG5cdHRoaXMuaW5wdXRUZXh0cyAgICAgICAgICAgPSBbIG5ldyBJbnB1dFRleHQoKSwgbmV3IElucHV0VGV4dCgpIF07XG5cdFxuXHR0aGlzLl9iaW5kRXZlbnRzKCk7XG5cdHRoaXMuX3VwZGF0ZVVJKHRoaXMuc3RvcmFnZS5kYXRhKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5cyBhIHdhcm5pbmcgbWVzc2FnZSBpZiBpbnB1dCBpcyB0b28gbG9uZyAoPiBtYXhOdW1iZXJPZlBhZ2VzKS5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSBpZHggLSB0aGUgaW5kZXggb2YgdGhlIHtJbnB1dFRleHR9IG9iamVjdCBpbiBpbnB1dFRleHRzW11cbiAqL1xuQ29udHJvbGxlci5wcm90b3R5cGUuX2FsZXJ0TG9uZ0lucHV0ID0gZnVuY3Rpb24oaWR4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0XG5cdC8vIENvbXB1dGUgYXBwcm94aW1hdGUgbnVtYmVyIG9mIHBhZ2VzIGZvciBpbnB1dFRleHRcblx0dmFyIG5yT2ZQYWdlcyA9IHNlbGYuaW5wdXRUZXh0c1tpZHhdLmdldE51bWJlck9mUGFnZXMoc2VsZi5tYXhDaGFyYWN0ZXJzUGVyUGFnZSk7XG5cdC8vIElmIGdyZWF0ZXIgdGhhbiBtYXhpbXVtIG51bWJlciBvZiBwYWdlcywgZGlzcGxheSB3YXJuaW5nIG1lc3NhZ2Vcblx0aWYgKG5yT2ZQYWdlcyA+IHNlbGYubWF4TnVtYmVyT2ZQYWdlcykge1xuXHRcdHZhciBpbnB1dE1vZGUgPSBzZWxmLmlucHV0VGV4dHNbaWR4XS5tb2RlO1xuXHRcdHZhciBtZXNzYWdlID0gW1xuXHRcdFx0XHRpbnB1dE1vZGUsICcgJywgKGlkeCArIDEpLCAnIGlzIHRvbyBsb25nLiBUbyBwcmV2ZW50IHZpc3VhbGl6YXRpb24gaXNzdWVzLCBwbGVhc2UgY29uc2lkZXIgdHJ1bmNhdGluZyB0aGlzICcsIGlucHV0TW9kZS50b0xvd2VyQ2FzZSgpLCAnLicgXG5cdFx0XHRdLmpvaW4oJycpO1xuXHRcdHZhciBkZWxheSA9IHNlbGYuX2NvbXB1dGVSZWFkaW5nU3BlZWQobWVzc2FnZSk7XG5cdFx0c2VsZi52aWV3LnNob3dBbGVydE1lc3NhZ2UoJ3dhcm5pbmcnLCBtZXNzYWdlLCBkZWxheSk7XG5cdH1cbn07XG5cbi8qKlxuICogQmluZHMgZXZlbnRzLlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICovXG5Db250cm9sbGVyLnByb3RvdHlwZS5fYmluZEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHRzZWxmLnZpZXcuYmluZCgnY2hhbmdlU3Bpbm5lcklucHV0JywgZnVuY3Rpb24oaWQsIG5ld1ZhbHVlKSB7XG5cdFx0c2VsZi5fdXBkYXRlU3RvcmFnZShpZCwgbmV3VmFsdWUpO1xuXHR9KTtcblx0XG5cdHNlbGYudmlldy5iaW5kKCdjb21wYXJlJywgZnVuY3Rpb24oKSB7XG5cdFx0c2VsZi5fY29tcGFyZSgpO1xuXHR9KTtcblx0XG5cdHNlbGYudmlldy5iaW5kKCdkaXNtaXNzQWxlcnQnKTtcblx0c2VsZi52aWV3LmJpbmQoJ2hpZGVQcmludERpYWxvZycpO1xuXHRzZWxmLnZpZXcuYmluZCgnaW5pdEJvb3RzdHJhcCcpO1xuXHRcblx0c2VsZi52aWV3LmJpbmQoJ2lucHV0RmlsZScsIGZ1bmN0aW9uKGZpbGUsIGlkeCwgbG9hZGluZ0VsZW0sIHRhYlBhbmVJZCkge1xuXHRcdHNlbGYuX3JlYWRGaWxlKGZpbGUsIGlkeCwgbG9hZGluZ0VsZW0sIHRhYlBhbmVJZCk7XG5cdH0pO1xuXHRcblx0c2VsZi52aWV3LmJpbmQoJ2lucHV0VGV4dCcsIGZ1bmN0aW9uKHRleHQsIGlkeCwgdGFiUGFuZUlkKSB7XG5cdFx0c2VsZi5fcmVhZFRleHQodGV4dCwgaWR4LCB0YWJQYW5lSWQpO1xuXHR9KTtcblx0XG5cdHNlbGYudmlldy5iaW5kKCdwcmludCcsIGZ1bmN0aW9uKGhpZGVNb2RhbFByb21pc2UpIHtcblx0XHRzZWxmLl9wcmludChoaWRlTW9kYWxQcm9taXNlKTtcblx0fSk7XG5cdFxuXHRzZWxmLnZpZXcuYmluZCgncmVzaXplJyk7XG5cdHNlbGYudmlldy5iaW5kKCdzY3JvbGxUb01hdGNoJyk7XG5cdHNlbGYudmlldy5iaW5kKCdzZWxlY3RUYWInKTtcblx0XG5cdHNlbGYudmlldy5iaW5kKCdzZWxlY3RIVE1MT3B0aW9uJywgZnVuY3Rpb24oaWR4LCBuZXdWYWx1ZSwgdGV4dCkge1xuXHRcdHNlbGYuaW5wdXRUZXh0c1tpZHhdLnNldEhUTUxPcHRpb24obmV3VmFsdWUpO1xuXHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRzZWxmLl9yZWFkVGV4dCh0ZXh0LCBpZHgsIHNlbGYuaW5wdXRUZXh0c1tpZHhdLnRhYlBhbmVJZCk7XG5cdFx0fVxuXHR9KTtcblx0XG5cdHNlbGYudmlldy5iaW5kKCdzZWxlY3RTZXR0aW5nc09wdGlvbicsIGZ1bmN0aW9uKGlkLCBuZXdWYWx1ZSkge1xuXHRcdHNlbGYuX3VwZGF0ZVN0b3JhZ2UoaWQsIG5ld1ZhbHVlKTtcblx0fSk7XG5cdFxuXHRzZWxmLnZpZXcuYmluZCgnc2hvd1ByaW50RGlhbG9nJyk7XG5cdHNlbGYudmlldy5iaW5kKCd0b2dnbGVJbnB1dFBhbmVsJyk7XG5cdHNlbGYudmlldy5iaW5kKCd0b2dnbGVTZXR0aW5nc1NpZGViYXInKTtcblx0c2VsZi52aWV3LmJpbmQoJ3RvZ2dsZVNldHRpbmdzU2lkZWJhclBhbmVzJyk7XG59O1xuXG4vKipcbiAqIEluaXRpYXRlcyB0aGUgY29tcGFyaXNvbiBwcm9jZXNzLlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICovXG5Db250cm9sbGVyLnByb3RvdHlwZS5fY29tcGFyZSA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHRpZiAoc2VsZi5faXNJbnB1dFZhbGlkKCkpIHtcblx0XHRzZWxmLnZpZXcudG9nZ2xlV2FpdGluZ0N1cnNvcignc2hvdycpO1xuXHRcdHZhciBzaW10ZXh0ZXIgPSBuZXcgU2ltVGV4dGVyKHNlbGYuc3RvcmFnZSk7XG5cdFx0XG5cdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdHNpbXRleHRlci5jb21wYXJlKHNlbGYuaW5wdXRUZXh0cykudGhlbihcblx0XHRcdFx0Ly8gT24gc3VjY2VzcywgdXBkYXRlIGluZm9ybWF0aW9uIG5vZGVzIGFuZCBkaXNwbGF5IHNpbWlsYXJpdGllc1xuXHRcdFx0XHRmdW5jdGlvbihub2Rlcykge1xuXHRcdFx0XHRcdHNlbGYudmlldy5yZXN1bHRzID0ge1xuXHRcdFx0XHRcdFx0dGV4dHMgICAgICAgICA6IHNpbXRleHRlci50ZXh0cyxcblx0XHRcdFx0XHRcdHVuaXF1ZU1hdGNoZXMgOiBzaW10ZXh0ZXIudW5pcXVlTWF0Y2hlc1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0c2VsZi52aWV3LmNyZWF0ZVRlbXBsYXRlcygpO1xuXHRcdFx0XHRcdHNlbGYudmlldy5zaG93U2ltaWxhcml0aWVzKG5vZGVzKTtcblx0XHRcdFx0XHRzZWxmLnZpZXcucmVzZXRTY3JvbGxiYXJzKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIE9uIGVycm9yLCBjbGVhciBvdXRwdXQgcGFuZWwgYW5kIGRpc3BsYXkgd2FybmluZyBtZXNzYWdlXG5cdFx0XHRcdGZ1bmN0aW9uKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHRzZWxmLnZpZXcuY2xlYXJPdXRwdXRQYW5lbCgpO1xuXHRcdFx0XHRcdHZhciBkZWxheSA9IHNlbGYuX2NvbXB1dGVSZWFkaW5nU3BlZWQobWVzc2FnZSk7XG5cdFx0XHRcdFx0c2VsZi52aWV3LnNob3dBbGVydE1lc3NhZ2UoJ2luZm8nLCBtZXNzYWdlLCBkZWxheSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSwgMjAwKTtcblx0fVxufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBhbW91bnQgb2YgdGltZSBpbiBtaWxsaXNlY29uZHNcbiAqIHRoYXQgYSB1c2VyIG5lZWRzIGluIG9yZGVyIHRvIHJlYWQgYSBtZXNzYWdlLlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgLSB0aGUgbWVzc2FnZSB0byBiZSByZWFkXG4gKi9cbkNvbnRyb2xsZXIucHJvdG90eXBlLl9jb21wdXRlUmVhZGluZ1NwZWVkID0gZnVuY3Rpb24obWVzc2FnZSkge1xuXHR2YXIgbWluTVMgPSA2MDAwO1xuXHR2YXIgc3BlZWQgPSBNYXRoLnJvdW5kKG1lc3NhZ2UubGVuZ3RoIC8gNDApICogNDAwMDtcblx0cmV0dXJuIChzcGVlZCA+IG1pbk1TKSA/IHNwZWVkIDogbWluTVM7XG59O1xuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgdXNlciBoYXMgcHJvdmlkZWQgYSB2YWxpZCBpbnB1dFxuICogaW4gYm90aCBzb3VyY2UgYW5kIHRhcmdldCBpbnB1dCBwYW5lcy5cbiAqIElmIG5vdCwgdGhlIHVzZXIgaXMgcHJvbXB0ZWQuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gLSB0cnVlIGlmIGlucHV0IGlzIHZhbGlkLCBlbHNlIGZhbHNlLlxuICovXG5Db250cm9sbGVyLnByb3RvdHlwZS5faXNJbnB1dFZhbGlkID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdGlzVmFsaWQgPSB0cnVlLFxuXHRcdFx0YWN0aXZlVGFiUGFuZUlkcyA9IHNlbGYudmlldy5nZXRBY3RpdmVUYWJQYW5lSWRzKCksXG5cdFx0XHRpVGV4dHNMZW5ndGggPSBzZWxmLmlucHV0VGV4dHMubGVuZ3RoO1xuXHRcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBpVGV4dHNMZW5ndGg7IGkrKykge1xuXHRcdHZhciBpbnB1dFRleHQgPSBzZWxmLmlucHV0VGV4dHNbaV07XG5cdFx0dmFyIGFjdGl2ZVRhYlBhbmVJZCA9IGFjdGl2ZVRhYlBhbmVJZHNbaV07XG5cdFx0XG5cdFx0dmFyIGlzSW5wdXRUZXh0VmFsaWQgPSAoaW5wdXRUZXh0LnRleHQgIT09IHVuZGVmaW5lZCAmJiBpbnB1dFRleHQudGFiUGFuZUlkID09PSBhY3RpdmVUYWJQYW5lSWQpO1xuXHRcdFxuXHRcdGlmICghaXNJbnB1dFRleHRWYWxpZCkge1xuXHRcdFx0c2VsZi52aWV3LnRvZ2dsZUVycm9yU3RhdHVzKCdzaG93JywgYWN0aXZlVGFiUGFuZUlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VsZi52aWV3LnRvZ2dsZUVycm9yU3RhdHVzKCdoaWRlJywgYWN0aXZlVGFiUGFuZUlkKTtcblx0XHR9XG5cdFx0XG5cdFx0aXNWYWxpZCA9IGlzVmFsaWQgJiYgaXNJbnB1dFRleHRWYWxpZDtcblx0fVxuXHRcblx0cmV0dXJuIGlzVmFsaWQ7XG59O1xuXG4vKipcbiAqIFNlbmRzIHRoZSBjb250ZW50cyBvZiB0aGUgY3VycmVudCB3aW5kb3dcbiAqIHRvIHRoZSBzeXN0ZW0ncyBwcmludGVyIGZvciBwcmludGluZy4gXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge1Byb21pc2V9IGhpZGVNb2RhbFByb21pc2UgLSBhIHByb21pc2UgdGhhdCBoYW5kbGVzIHRoZSBoaWRpbmcgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgb2YgdGhlICdQUklOVCBPVVRQVVQnIGRpYWxvZy4gXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgV2hlbiByZXNvbHZlZCwgdGhlIGN1cnJlbnQgd2luZG93IFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IGlzIHNlbnQgdG8gcHJpbnRpbmcuXG4gKi9cbkNvbnRyb2xsZXIucHJvdG90eXBlLl9wcmludCA9IGZ1bmN0aW9uKGhpZGVNb2RhbFByb21pc2UpIHtcblx0dmFyIHN1Y2Nlc3MgPSBmdW5jdGlvbigpIHtcblx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0d2luZG93LnByaW50KCk7XG5cdFx0fSwgNzAwKTtcblx0fTtcblx0XG5cdCQud2hlbihoaWRlTW9kYWxQcm9taXNlKS50aGVuKHN1Y2Nlc3MpO1xufTtcblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgY29udGVudHMgb2YgdGhlIHNlbGVjdGVkIGZpbGVcbiAqIGFuZCB1cGRhdGVzIHRoZSByZWxldmFudCBmaWVsZHMgb2YgdGhlIHtJbnB1dFRleHR9IG9iamVjdC5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RmlsZUxpc3R9IGZpbGUgICAgICAgIC0gdGhlIGZpbGUgc2VsZWN0ZWQgYnkgdGhlIHVzZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSAgIGlkeCAgICAgICAgIC0gdGhlIGluZGV4IG9mIHRoZSB7SW5wdXRUZXh0fSBvYmplY3QgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpbiBpbnB1dFRleHRzW10gdG8gYmUgdXBkYXRlZC5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMDogaW5wdXQgaW4gbGVmdC1zaWRlIHBhbmUgXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDE6IGlucHV0IGluIHJpZ2h0LXNpZGUgcGFuZVxuICogQHBhcmFtIHtPYmplY3R9ICAgbG9hZGluZ0VsZW0gLSB0aGUgbm9kZSBlbGVtZW50IHRoYXQgc2hvd3MgXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBwcm9ncmVzcyBvZiByZWFkaW5nICBcbiAqIEBwYXJhbSB7U3RyaW5nfSAgIHRhYlBhbmVJZCAgIC0gdGhlIGlkIG9mIHRoZSBhY3RpdmUgdGFiIHBhbmVcbiAqL1xuQ29udHJvbGxlci5wcm90b3R5cGUuX3JlYWRGaWxlID0gZnVuY3Rpb24oZmlsZSwgaWR4LCBsb2FkaW5nRWxlbSwgdGFiUGFuZUlkKSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0ICAgIGlnbm9yZUZvb3Rub3RlcyA9IHNlbGYuc3RvcmFnZS5nZXRJdGVtVmFsdWVCeUtleSgnaWdub3JlRm9vdG5vdGVzJyk7XG5cdCAgICBcblx0dmFyIHN1Y2Nlc3MgPSBmdW5jdGlvbih0ZXh0KSB7XG5cdFx0XHQvLyBVcGRhdGUge0lucHV0VGV4dH0gb2JqZWN0XG5cdFx0XHRzZWxmLmlucHV0VGV4dHNbaWR4XS5zZXRGaWxlSW5wdXQoZmlsZSwgdGV4dCwgdGFiUGFuZUlkKTtcblx0XHRcdHNlbGYudmlldy5sb2FkaW5nKCdkb25lJywgbG9hZGluZ0VsZW0pO1xuXHRcdFx0c2VsZi52aWV3LmNsZWFyVGFiUGFuZVRleHRJbnB1dChpZHgpO1xuXHRcdFx0c2VsZi5fYWxlcnRMb25nSW5wdXQoaWR4KTtcblx0XHR9O1xuXHRcdFxuXHRcdHZhciBlcnJvciA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcblx0XHRcdHNlbGYuaW5wdXRUZXh0c1tpZHhdLnJlc2V0KCk7XG5cdFx0XHRzZWxmLnZpZXcubG9hZGluZygnZXJyb3InLCBsb2FkaW5nRWxlbSk7XG5cdFx0XHRzZWxmLnZpZXcuY2xlYXJUYWJQYW5lVGV4dElucHV0KGlkeCk7XG5cdFx0XHRcblx0XHRcdHZhciBkZWxheSA9IHNlbGYuX2NvbXB1dGVSZWFkaW5nU3BlZWQobWVzc2FnZSk7XG5cdFx0XHRzZWxmLnZpZXcuc2hvd0FsZXJ0TWVzc2FnZSgnZXJyb3InLCBtZXNzYWdlLCBkZWxheSk7XG5cdFx0fTtcblx0XG5cdGlmIChmaWxlKSB7XG5cdFx0dmFyIGxvYWRpbmdTdGFydGVkID0gc2VsZi52aWV3LmxvYWRpbmcoJ3N0YXJ0JywgbG9hZGluZ0VsZW0pO1xuXHRcdHZhciBmaWxlSW5wdXRSZWFkZXIgPSBuZXcgRmlsZUlucHV0UmVhZGVyKGZpbGUsIGlnbm9yZUZvb3Rub3Rlcyk7XG5cdFx0ZmlsZUlucHV0UmVhZGVyLnJlYWRGaWxlSW5wdXQobG9hZGluZ1N0YXJ0ZWQpLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuXHR9IGVsc2Uge1xuXHRcdHNlbGYudmlldy5sb2FkaW5nKCdjYW5jZWwnLCBsb2FkaW5nRWxlbSk7XG5cdFx0c2VsZi5pbnB1dFRleHRzW2lkeF0ucmVzZXQoKTtcblx0fVxufTtcblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgY29udGVudHMgb2YgdGhlIHR5cGVkL3Bhc3RlZCBIVE1ML3BsYWluIHRleHRcbiAqIGFuZCB1cGRhdGVzIHRoZSByZWxldmFudCBmaWVsZHMgb2YgdGhlIHtJbnB1dFRleHR9IG9iamVjdC5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0ICAgICAgLSB0aGUgSFRNTC9wbGFpbiB0ZXh0IHByb3ZpZGVkIGJ5IHRoZSB1c2VyXG4gKiBAcGFyYW0ge051bWJlcn0gaWR4ICAgICAgIC0gdGhlIGluZGV4IG9mIHRoZSB7SW5wdXRUZXh0fSBvYmplY3QgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IGluIGlucHV0VGV4dHNbXSB0byBiZSB1cGRhdGVkLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgIDA6IGlucHV0IGluIGxlZnQtc2lkZSBwYW5lLCBcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAxOiBpbnB1dCBpbiByaWdodC1zaWRlIHBhbmVcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWJQYW5lSWQgLSB0aGUgaWQgb2YgdGhlIGFjdGl2ZSB0YWIgcGFuZVxuICovXG5Db250cm9sbGVyLnByb3RvdHlwZS5fcmVhZFRleHQgPSBmdW5jdGlvbih0ZXh0LCBpZHgsIHRhYlBhbmVJZCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHR2YXIgc3VjY2VzcyA9IGZ1bmN0aW9uKGNsZWFuZWRUZXh0KSB7XG5cdFx0Ly8gVXBkYXRlIHtJbnB1dFRleHR9IG9iamVjdFxuXHRcdHNlbGYuaW5wdXRUZXh0c1tpZHhdLnNldFRleHRJbnB1dChjbGVhbmVkVGV4dCwgdGFiUGFuZUlkKTtcblx0XHRzZWxmLnZpZXcudG9nZ2xlQ29tcGFyZUJ0bignZW5hYmxlJyk7XG5cdFx0c2VsZi52aWV3LmNsZWFyVGFiUGFuZUZpbGVJbnB1dChpZHgpO1xuXHRcdHNlbGYuX2FsZXJ0TG9uZ0lucHV0KGlkeCk7XG5cdH07XG5cdFxuXHR2YXIgZXJyb3IgPSBmdW5jdGlvbihtZXNzYWdlKSB7XG5cdFx0c2VsZi5pbnB1dFRleHRzW2lkeF0ucmVzZXQoKTtcblx0XHRzZWxmLnZpZXcudG9nZ2xlQ29tcGFyZUJ0bignZW5hYmxlJyk7XG5cdFx0dmFyIGRlbGF5ID0gc2VsZi5fY29tcHV0ZVJlYWRpbmdTcGVlZChtZXNzYWdlKTtcblx0XHRzZWxmLnZpZXcuc2hvd0FsZXJ0TWVzc2FnZSgnZXJyb3InLCBtZXNzYWdlLCBkZWxheSk7XG5cdH07XG5cdFxuXHRpZiAodGV4dC5sZW5ndGggPiAwICYmIC9cXFMvLnRlc3QodGV4dCkpIHtcblx0XHRpZiAoc2VsZi5pbnB1dFRleHRzW2lkeF0uaXNIVE1MKSB7XG5cdFx0XHRzZWxmLnZpZXcudG9nZ2xlQ29tcGFyZUJ0bignZGlzYWJsZScpO1xuXHRcdFx0dmFyIHRleHRJbnB1dFJlYWRlciA9IG5ldyBUZXh0SW5wdXRSZWFkZXIoKTtcblx0XHRcdHRleHRJbnB1dFJlYWRlci5yZWFkVGV4dElucHV0KHRleHQpLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdWNjZXNzKHRleHQpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRzZWxmLmlucHV0VGV4dHNbaWR4XS5yZXNldCgpO1xuXHR9XG59O1xuXG4vKipcbiAqIFVwZGF0ZXMgdGhlIHZhbHVlIG9mIGEgc2V0dGluZywgc3RvcmVkIGluIHRoZSB7U3RvcmFnZX0gb2JqZWN0LlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtTdHJpbmd9ICAgICAgICAgICBpZCAgICAgICAtIHRoZSBpZCBvZiB0aGUgc2V0dGluZ1xuICogQHBhcmFtIHsoQm9vbGVhbnxOdW1iZXIpfSBuZXdWYWx1ZSAtIHRoZSBuZXcgdmFsdWUgb2YgdGhlIHNldHRpbmdcbiAqL1xuQ29udHJvbGxlci5wcm90b3R5cGUuX3VwZGF0ZVN0b3JhZ2UgPSBmdW5jdGlvbihpZCwgbmV3VmFsdWUpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLnN0b3JhZ2Uuc2V0SXRlbVZhbHVlQnlJZChpZCwgbmV3VmFsdWUpO1xufTtcblxuLyoqXG4gKiBVcGRhdGVzIHRoZSB7Vmlld30gb2JqZWN0IHdpdGggdGhlIHZhbHVlcyBvZiB0aGUgc2V0dGluZ3MsXG4gKiBzdG9yZWQgaW4gdGhlIHtTdG9yYWdlfSBvYmplY3QuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSAtIHRoZSBvYmplY3QgdGhhdCBob2xkcyB0aGUgc3RvcmFnZSdzIHNldHRpbmdzXG4gKi9cbkNvbnRyb2xsZXIucHJvdG90eXBlLl91cGRhdGVVSSA9IGZ1bmN0aW9uKGRhdGEpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcblx0Zm9yICh2YXIga2V5IGluIGRhdGEpIHtcblx0XHR2YXIgb2JqID0gZGF0YVtrZXldO1xuXHRcdHNlbGYudmlldy51cGRhdGVVSU9wdGlvbihvYmouaWQsIG9iai50eXBlLCBvYmoudmFsdWUpO1xuXHR9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENvbnRyb2xsZXI7IiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7SW5wdXRUZXh0fSxcbiAqIHdoaWNoIGhvbGRzIGluZm9ybWF0aW9uIG9uIHRoZSB1c2VyIGlucHV0LlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge0lucHV0VGV4dH1cbiAqIEBwYXJhbSB7U3RyaW5nfSBtb2RlICAgICAgLSB0aGUgbW9kZSBvZiBpbnB1dCAoaS5lLiBcImZpbGVcIiBvciBcInRleHRcIilcbiAqIEBwYXJhbSB7RmlsZX0gICBmaWxlICAgICAgLSB0aGUgZmlsZSBzZWxlY3RlZCBieSB0aGUgdXNlclxuICogQHBhcmFtIHtTdHJpbmd9IHRleHQgICAgICAtIHRoZSBpbnB1dCBzdHJpbmdcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YWJQYW5lSWQgLSB0aGUgaWQgb2YgdGhlIHRhYiBwYW5lXG4gKi9cbmZ1bmN0aW9uIElucHV0VGV4dChtb2RlLCBmaWxlLCB0ZXh0LCB0YWJQYW5lSWQpIHtcblx0dGhpcy50YWJQYW5lSWQgID0gdGFiUGFuZUlkO1xuXHR0aGlzLm1vZGUgICAgICAgPSBtb2RlO1xuXHR0aGlzLmlzSFRNTCAgICAgPSBmYWxzZTtcblx0dGhpcy5maWxlTmFtZSAgID0gKGZpbGUgJiYgZmlsZS5uYW1lKTtcblx0dGhpcy50ZXh0ICAgICAgID0gdGV4dDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBhcHByb3hpbWF0ZSBudW1iZXIgb2YgcGFnZXMgb2YgdGhlIGlucHV0IHN0cmluZy5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtICAge051bWJlcn0gbWF4Q2hhcmFjdGVyc1BlclBhZ2UgLSB0aGUgbWF4aW11bSBudW1iZXIgb2YgY2hhcmFjdGVycyBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHBlciBwYWdlXG4gKiBAcmV0dXJucyB7TnVtYmVyfSAgICAgICAgICAgICAgICAgICAgICAtIHRoZSBjYS4gbnVtYmVyIG9mIHBhZ2VzXG4gKi9cbklucHV0VGV4dC5wcm90b3R5cGUuZ2V0TnVtYmVyT2ZQYWdlcyA9IGZ1bmN0aW9uKG1heENoYXJhY3RlcnNQZXJQYWdlKSB7XG5cdHJldHVybiAodGhpcy50ZXh0Lmxlbmd0aCAvIG1heENoYXJhY3RlcnNQZXJQYWdlKTtcbn07XG5cbi8qKlxuICogUmVzZXRzIHNvbWUgZmllbGRzIG9mIHRoZSB7SW5wdXRUZXh0fS5cbiAqIEBmdW5jdGlvblxuICovXG5JbnB1dFRleHQucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMudGFiUGFuZUlkICA9IHVuZGVmaW5lZDtcblx0dGhpcy5tb2RlICAgICAgID0gdW5kZWZpbmVkO1xuXHR0aGlzLmZpbGVOYW1lICAgPSB1bmRlZmluZWQ7XG5cdHRoaXMudGV4dCAgICAgICA9IHVuZGVmaW5lZDtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgZmllbGRzIGZvciB0aGUgZmlsZSBpbnB1dC5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtGaWxlfSAgIGZpbGUgICAgICAtIHRoZSBmaWxlIHNlbGVjdGVkIGJ5IHRoZSB1c2VyXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dCAgICAgIC0gdGhlIGZpbGUgaW5wdXQgc3RyaW5nXG4gKiBAcGFyYW0ge1N0cmluZ30gdGFiUGFuZUlkIC0gdGhlIGlkIG9mIHRoZSB0YWIgcGFuZVxuICovXG5JbnB1dFRleHQucHJvdG90eXBlLnNldEZpbGVJbnB1dCA9IGZ1bmN0aW9uKGZpbGUsIHRleHQsIHRhYlBhbmVJZCkge1xuXHR0aGlzLnRhYlBhbmVJZCAgPSB0YWJQYW5lSWQ7XG5cdHRoaXMubW9kZSAgICAgICA9ICdGaWxlJztcblx0dGhpcy5maWxlTmFtZSAgID0gZmlsZS5uYW1lO1xuXHR0aGlzLnRleHQgICAgICAgPSB0ZXh0O1xufTtcblxuLyoqXG4gKiBTZXRzIHRoZSBmaWVsZHMgZm9yIHRoZSB0ZXh0IGlucHV0LlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dCAgICAgIC0gdGhlIHRleHQgaW5wdXQgc3RyaW5nXG4gKiBAcGFyYW0ge1N0cmluZ30gdGFiUGFuZUlkIC0gdGhlIGlkIG9mIHRoZSB0YWIgcGFuZVxuICovXG5JbnB1dFRleHQucHJvdG90eXBlLnNldFRleHRJbnB1dCA9IGZ1bmN0aW9uKHRleHQsIHRhYlBhbmVJZCkge1xuXHR0aGlzLnRhYlBhbmVJZCAgPSB0YWJQYW5lSWQ7XG5cdHRoaXMubW9kZSAgICAgICA9ICdUZXh0Jztcblx0dGhpcy5maWxlTmFtZSAgID0gKHRoaXMuaXNIVE1MKSA/ICdIVE1MIHRleHQgaW5wdXQnIDogJ1BsYWluIHRleHQgaW5wdXQnO1xuXHR0aGlzLnRleHQgICAgICAgPSB0ZXh0O1xufTtcblxuSW5wdXRUZXh0LnByb3RvdHlwZS5zZXRIVE1MT3B0aW9uID0gZnVuY3Rpb24obmV3VmFsdWUpIHtcblx0dGhpcy5pc0hUTUwgPSBuZXdWYWx1ZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSW5wdXRUZXh0OyIsIi8qIGpzaGludCB1bmRlZjp0cnVlLCB1bnVzZWQ6dHJ1ZSwgbm9kZTp0cnVlLCBicm93c2VyOnRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIGEge1N0b3JhZ2V9LFxuICogd2hpY2ggc3RvcmVzIHRoZSB2YWx1ZXMgb2YgdGhlIGFwcCdzIHNldHRpbmdzLlxuICogSWYgbG9jYWwgc3RvcmFnZSBpcyBzdXBwb3J0ZWQgYnkgdGhlIGJyb3dzZXIsXG4gKiB0aGVzZSBzZXR0aW5ncyBhcmUgYWxzbyBzdG9yZWQgdW5kZXIgdGhlIHNwZWNpZmllZCBuYW1lc3BhY2UsXG4gKiB0aHVzIHByb3ZpZGluZyB0aGUgYXBwIHdpdGggYSBzdGF0ZS5cbiAqIFRoZSBsYXN0IHN0b3JlZCBzZXR0aW5ncyB3aWxsIGJlIHJlc3RvcmVkIFxuICogd2hlbiByZWZyZXNoaW5nIHRoZSBwYWdlIG9yIHJlc3RhcnRpbmcgdGhlIGJyb3dzZXIuIFxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge1N0b3JhZ2V9XG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlIC0gdGhlIG5hbWVzcGFjZSBvZiB0aGUgYXBwIChpLmUuIFwic2ltdGV4dGVyXCIpXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSAgICAgIC0gdGhlIG9iamVjdCB0aGF0IGhvbGRzIHRoZSBhcHAncyBzZXR0aW5nc1xuICovXG5mdW5jdGlvbiBTdG9yYWdlKG5hbWVzcGFjZSwgZGF0YSkge1xuXHQgdGhpcy5fZGIgID0gbmFtZXNwYWNlO1xuXHQgdGhpcy5kYXRhID0gdGhpcy5faW5pdGlhbGl6ZShuYW1lc3BhY2UsIGRhdGEpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHZhbHVlIG9mIGEgc2V0dGluZywgcmV0cmlldmVkIGJ5IGl0cyBrZXkgdmFsdWUuXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgLSB0aGUga2V5IHZhbHVlIG9mIHRoZSBzZXR0aW5nXG4gKi9cblN0b3JhZ2UucHJvdG90eXBlLmdldEl0ZW1WYWx1ZUJ5S2V5ID0gZnVuY3Rpb24oa2V5KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0cmV0dXJuIHNlbGYuX2dldEl0ZW1CeUtleShrZXkpLnZhbHVlO1xufTtcblxuLyoqXG4gKiBTZXRzIHRoZSBuZXcgdmFsdWUgb2YgYSBzZXR0aW5nLCByZXRyaWV2ZWQgYnkgaXRzIGlkIHZhbHVlLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gICAgICAgICAgIGlkICAgICAgIC0gdGhlIGlkIG9mIHRoZSBzZXR0aW5nXG4gKiBAcGFyYW0geyhCb29sZWFufE51bWJlcil9IG5ld1ZhbHVlIC0gdGhlIG5ldyB2YWx1ZSBvZiB0aGUgc2V0dGluZ1xuICovXG5TdG9yYWdlLnByb3RvdHlwZS5zZXRJdGVtVmFsdWVCeUlkID0gZnVuY3Rpb24oaWQsIG5ld1ZhbHVlKSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0ICAgIGl0ZW0gPSBzZWxmLl9nZXRJdGVtQnlJZChpZCk7XG5cdFxuXHRpdGVtLnZhbHVlID0gbmV3VmFsdWU7XG5cdHNlbGYuX3NhdmUoc2VsZi5kYXRhKTtcbn07XG5cbi8qKlxuICogUmV0cmlldmVzIGEgc2V0dGluZyBieSBpdHMgaWQgdmFsdWUuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge1N0cmluZ30gaWQgLSB0aGUgaWQgb2YgdGhlIHNldHRpbmdcbiAqL1xuU3RvcmFnZS5wcm90b3R5cGUuX2dldEl0ZW1CeUlkID0gZnVuY3Rpb24oaWQpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHQgICAgZGF0YSA9IHNlbGYuZGF0YTtcblx0XG5cdGZvciAodmFyIGtleSBpbiBkYXRhKSB7XG5cdFx0dmFyIG9iaiA9IGRhdGFba2V5XTtcblx0XHRpZiAob2JqLmlkID09PSBpZCkge1xuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9XG5cdH1cblx0XG5cdHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG4vKipcbiAqIFJldHJpZXZlcyBhIHNldHRpbmcgYnkgaXRzIGtleSB2YWx1ZS5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBrZXkgLSB0aGUga2V5IHZhbHVlIG9mIHRoZSBzZXR0aW5nXG4gKi9cblN0b3JhZ2UucHJvdG90eXBlLl9nZXRJdGVtQnlLZXkgPSBmdW5jdGlvbihrZXkpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRyZXR1cm4gc2VsZi5kYXRhW2tleV07XG59O1xuXG4vKipcbiAqIFN0b3JlcyB0aGUgYXBwJ3Mgc2V0dGluZ3MgaW4gdGhlIHdlYiBicm93c2VyJ3MgbG9jYWwgc3RvcmFnZVxuICogdW5kZXIgdGhlIHNwZWNpZmllZCBuYW1lc3BhY2UuXG4gKiBJZiBsb2NhbCBzdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQsIHN0b3JlcyB0aGUgc2V0dGluZ3NcbiAqIGluIHtTdG9yYWdlLmRhdGF9LlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZSAtIHRoZSBuYW1lc3BhY2Ugb2YgdGhlIGFwcFxuICogQHBhcmFtIHtPYmplY3R9IGRhdGEgICAgICAtIHRoZSBvYmplY3QgdGhhdCBob2xkcyB0aGUgYXBwJ3Mgc2V0dGluZ3NcbiAqL1xuU3RvcmFnZS5wcm90b3R5cGUuX2luaXRpYWxpemUgPSBmdW5jdGlvbihuYW1lc3BhY2UsIGRhdGEpIHtcblx0aWYgKGxvY2FsU3RvcmFnZSkge1xuXHRcdGlmICghbG9jYWxTdG9yYWdlW25hbWVzcGFjZV0pIHtcblx0XHRcdGxvY2FsU3RvcmFnZS5zZXRJdGVtKG5hbWVzcGFjZSwgSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgc3RvcmUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShuYW1lc3BhY2UpO1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2Uoc3RvcmUpO1xuXHRcdH1cblx0fVxuXHRcblx0cmV0dXJuIGRhdGE7XG59O1xuXG4vKipcbiAqIFN0b3JlcyB0aGUgc2V0dGluZ3MgaW4gdGhlIGxvY2FsIHN0b3JhZ2UuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YSAtIHRoZSBkYXRhIChzZXR0aW5ncykgdG8gYmUgdXBkYXRlZFxuICovXG5TdG9yYWdlLnByb3RvdHlwZS5fc2F2ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcblx0aWYgKGxvY2FsU3RvcmFnZSAmJiBsb2NhbFN0b3JhZ2VbdGhpcy5fZGJdKSB7XG5cdFx0bG9jYWxTdG9yYWdlLnNldEl0ZW0odGhpcy5fZGIsIEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcblx0fVxuXHR0aGlzLmRhdGEgPSBkYXRhO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTdG9yYWdlO1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7VGVtcGxhdGV9LFxuICogd2hpY2ggYXBwZW5kcyBub2RlIGVsZW1lbnRzIGluIHRoZSBET00gb3IgdXBkYXRlcyB0aGVpciBpbm5lciBjb250ZW50LiBcbiAqIEBjb25zdHJ1Y3RvclxuICogQHRoaXMge1RlbXBsYXRlfVxuICovXG5mdW5jdGlvbiBUZW1wbGF0ZSgpIHtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBub2RlIGVsZW1lbnQgb2YgdGhlIHRlbXBsYXRlXG4gKiBmb3IgZGlzcGxheWluZyB3YXJuaW5nIG1lc3NhZ2VzLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0gICB7U3RyaW5nfSB0eXBlICAgIC0gdGhlIHR5cGUgb2Ygd2FybmluZ1xuICogQHBhcmFtICAge1N0cmluZ30gbWVzc2FnZSAtIHRoZSB0ZXh0IG9mIHRoZSB3YXJuaW5nIG1lc3NhZ2VcbiAqIEByZXR1cm5zIHtPYmplY3R9ICAgICAgICAgLSB0aGUgdG9wIG5vZGUgZWxlbWVudFxuICovXG5UZW1wbGF0ZS5wcm90b3R5cGUuY3JlYXRlQWxlcnRNZXNzYWdlID0gZnVuY3Rpb24odHlwZSwgbWVzc2FnZSkge1xuXHR2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XG5cdGRpdi5jbGFzc05hbWUgPSAnYWxlcnQgYWxlcnQtd2FybmluZyc7XG5cdGRpdi5pbm5lckhUTUwgPSBbXG5cdFx0XHQnPHRhYmxlIGNsYXNzPVwidGFibGUgdGFibGUtY29uZGVuc2VkXCI+Jyxcblx0XHRcdFx0Jzx0Ym9keT4nLFxuXHRcdFx0XHRcdCc8dHI+Jyxcblx0XHRcdFx0XHRcdCc8dGQgY2xhc3M9XCJoNVwiPjxpIGNsYXNzPVwiZmEgZmEtZXhjbGFtYXRpb24tY2lyY2xlXCI+PC9pPjwvdGQ+Jyxcblx0XHRcdFx0XHRcdCc8dGQ+Jyxcblx0XHRcdFx0XHRcdFx0JzxoNT4nLCB0eXBlLCAnPC9oNT4nLFxuXHRcdFx0XHRcdFx0XHQnPHA+JywgbWVzc2FnZSwgJzwvcD4nLFxuXHRcdFx0XHRcdFx0JzwvdGQ+Jyxcblx0XHRcdFx0XHQnPC90cj4nLFxuXHRcdFx0XHQnPC90Ym9keT4nLFxuXHRcdFx0JzwvdGFibGU+J1xuXHRcdF0uam9pbignJyk7XG5cdFx0XG5cdHJldHVybiBkaXY7XG59O1xuXG4vKipcbiAqIFVwZGF0ZXMgdGhlIGlubmVyIEhUTUwgY29udGVudCBvZiB0aGUgb3V0cHV0IHRpdGxlcy5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtBcnJheX0gdGV4dHMgLSB0aGUgYXJyYXkgdGhhdCBob2xkcyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgdXNlciBpbnB1dFxuICovXG5UZW1wbGF0ZS5wcm90b3R5cGUuY3JlYXRlT3V0cHV0VGl0bGVzID0gZnVuY3Rpb24odGV4dHMpIHtcblx0dmFyIHRhcmdldHMgPSBbIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdXRwdXQtdGl0bGUtMScpLCBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3V0cHV0LXRpdGxlLTInKSBdLFxuXHQgICAgdExlbmd0aCA9IHRhcmdldHMubGVuZ3RoO1xuXHRcdFxuXHRmb3IgKHZhciBpID0gMDsgaSA8IHRMZW5ndGg7IGkrKykge1xuXHRcdHZhciBmaWxlTmFtZSA9IHRleHRzW2ldLmZpbGVOYW1lIHx8ICcnO1xuXHRcdHZhciBtb2RlICAgICA9IHRleHRzW2ldLmlucHV0TW9kZTtcblx0XHR2YXIgdGFyZ2V0ICAgPSB0YXJnZXRzW2ldO1xuXHRcdHRhcmdldC5pbm5lckhUTUwgPSBbXG5cdFx0XHRcdCc8cD48Yj4nLCBtb2RlLnRvVXBwZXJDYXNlKCksICc6IDwvYj4nLCBmaWxlTmFtZSwgJzwvcD4gJyxcblx0XHRcdF0uam9pbignJyk7XG5cdH1cbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbm9kZSBlbGVtZW50IG9mIHRoZSB0ZW1wbGF0ZVxuICogZm9yIGRpc3BsYXlpbmcgdGhlIFwiUFJJTlQgT1VUUFVUXCIgZGlhbG9nLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0gICB7QXJyYXl9IHRleHRzIC0gdGhlIGFycmF5IHRoYXQgaG9sZHMgaW5mb3JtYXRpb24gXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFib3V0IHRoZSB1c2VyIGlucHV0XG4gKiBAcmV0dXJucyB7T2JqZWN0fSAgICAgIC0gdGhlIHRvcCBub2RlIGVsZW1lbnRcbiAqL1xuVGVtcGxhdGUucHJvdG90eXBlLmNyZWF0ZVByaW50RGlhbG9nID0gZnVuY3Rpb24odGV4dHMpIHtcblx0dmFyIHNlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzZWN0aW9uJyk7XG5cdFxuXHRzZWN0aW9uLmlkID0gJ21vZGFsLXByaW50Jztcblx0c2VjdGlvbi5jbGFzc05hbWUgPSAnbW9kYWwgZmFkZSc7XG5cdHNlY3Rpb24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpO1xuXHRzZWN0aW9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcblx0c2VjdGlvbi5pbm5lckhUTUwgPSBbXG5cdFx0XHQnPGRpdiBjbGFzcz1cIm1vZGFsLWRpYWxvZ1wiPicsXG5cdCAgICAgICc8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudFwiPicsXG4gICAgICAgICAgJzxkaXYgY2xhc3M9XCJtb2RhbC1oZWFkZXJcIj4nLFxuICAgICAgICAgICAgJzxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY2xvc2VcIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiIGFyaWEtbGFiZWw9XCJDbG9zZVwiPicsXG4gICAgICAgICAgICAgICc8c3BhbiBhcmlhLWhpZGRlbj1cInRydWVcIj4mdGltZXM7PC9zcGFuPicsXG4gICAgICAgICAgICAnPC9idXR0b24+JyxcbiAgICAgICAgICAgICc8aDQgY2xhc3M9XCJtb2RhbC10aXRsZVwiPlByaW50IG91dHB1dDwvaDQ+JyxcbiAgICAgICAgICAnPC9kaXY+JyxcbiAgICAgICAgICAnPGRpdiBjbGFzcz1cIm1vZGFsLWJvZHlcIj4nLFxuICAgICAgICAgICAgJzxkaXYgY2xhc3M9XCJyb3dcIj4nLFxuICAgICAgICAgICAgICAnPGRpdiBjbGFzcz1cImNvbC14cy02XCI+JyxcbiAgICAgICAgICAgICAgICAnPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgZm9ybS1ncm91cC1zbVwiPicsXG4gICAgICAgICAgICAgICAgICAnPGxhYmVsIGZvcj1cImlucHV0LWNvbW1lbnQtMVwiPjE6IENvbW1lbnQgZm9yICcsIHRleHRzWzBdLmlucHV0TW9kZSwgJzwvbGFiZWw+JyxcbiAgICAgICAgICAgICAgICAgICc8dGV4dGFyZWEgaWQ9XCJpbnB1dC1jb21tZW50LTFcIiBjbGFzcz1cImZvcm0tY29udHJvbFwiIHJvd3M9XCI1XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgcGxhY2Vob2xkZXI9XCJUeXBlIGEgY29tbWVudFwiPjwvdGV4dGFyZWE+JyxcbiAgICAgICAgICAgICAgICAnPC9kaXY+JyxcbiAgICAgICAgICAgICAgJzwvZGl2PicsXG4gICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwiY29sLXhzLTZcIj4nLFxuICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCBmb3JtLWdyb3VwLXNtXCI+JyxcbiAgICAgICAgICAgICAgICAgICc8bGFiZWwgZm9yPVwiaW5wdXQtY29tbWVudC0yXCI+MjogQ29tbWVudCBmb3IgJywgdGV4dHNbMV0uaW5wdXRNb2RlLCAnPC9sYWJlbD4nLFxuICAgICAgICAgICAgICAgICAgJzx0ZXh0YXJlYSBpZD1cImlucHV0LWNvbW1lbnQtMlwiIGNsYXNzPVwiZm9ybS1jb250cm9sXCIgcm93cz1cIjVcIiBhdXRvY29tcGxldGU9XCJvZmZcIiBwbGFjZWhvbGRlcj1cIlR5cGUgYSBjb21tZW50XCI+PC90ZXh0YXJlYT4nLFxuICAgICAgICAgICAgICAgICc8L2Rpdj4nLFxuICAgICAgICAgICAgICAnPC9kaXY+JyxcbiAgICAgICAgICAgICc8L2Rpdj4nLFxuICAgICAgICAgICc8L2Rpdj4nLFxuICAgICAgICAgICc8ZGl2IGNsYXNzPVwibW9kYWwtZm9vdGVyXCI+JyxcbiAgICAgICAgICAgICc8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGVmYXVsdCBidG4tc21cIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiPkNhbmNlbDwvYnV0dG9uPicsXG4gICAgICAgICAgICAnPGJ1dHRvbiBpZD1cIm1vZGFsLXByaW50LWJ0blwiIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4tc21cIj5QcmludDwvYnV0dG9uPicsXG4gICAgICAgICAgJzwvZGl2PicsXG5cdCAgICAgICc8L2Rpdj4nLFxuICAgICAgJzwvZGl2Pidcblx0XHRdLmpvaW4oJycpO1xuXHRcdFxuXHRyZXR1cm4gc2VjdGlvbjtcbn07XG5cbi8qKlxuICogVXBkYXRlcyB0aGUgaW5uZXIgSFRNTCBjb250ZW50IG9mIHRoZSBoaWRkZW4sIG9uIHNjcmVlbiwgbm9kZSBlbGVtZW50XG4gKiB0aGF0IGhvbGRzIHRoZSBpbmZvcm1hdGlvbiAoc3RhdGlzdGljcyAmIGNvbW1lbnRzKSB0byBiZSBwcmludGVkLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge0FycmF5fSAgdGV4dHMgICAgICAgICAtIHRoZSBhcnJheSB0aGF0IGhvbGRzIGluZm9ybWF0aW9uIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgYWJvdXQgdGhlIHVzZXIgaW5wdXRcbiAqIEBwYXJhbSB7TnVtYmVyfSB1bmlxdWVNYXRjaGVzIC0gdGhlIG51bWJlciBvZiB0aGUgdW5pcXVlIG1hdGNoZXMgZm91bmRcbiAqL1xuVGVtcGxhdGUucHJvdG90eXBlLmNyZWF0ZVByaW50U3VtbWFyeSA9IGZ1bmN0aW9uKHRleHRzLCB1bmlxdWVNYXRjaGVzKSB7XG5cdHZhciB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncHJpbnQtc3VtbWFyeScpO1xuXHRcdFxuXHR0YXJnZXQuaW5uZXJIVE1MID0gW1xuXHRcdFx0JzxoND5DT01QQVJJU09OIFNVTU1BUlk8L2g0PicsXG5cdFx0XHQnPGg2PkRBVEUvVElNRTogJywgKG5ldyBEYXRlKCkpLnRvVVRDU3RyaW5nKCksICc8L2g2PicsXG5cdFx0ICAnPHRhYmxlIGNsYXNzPVwidGFibGUgdGFibGUtY29uZGVuc2VkIHRhYmxlLWJvcmRlcmVkXCI+Jyxcblx0ICAgICAgJzx0aGVhZD4nLFxuXHQgICAgICAgICc8dHI+Jyxcblx0ICAgICAgICAgICc8dGggY2xhc3M9XCJjb2wteHMtMlwiPjwvdGg+Jyxcblx0ICAgICAgICAgICc8dGggY2xhc3M9XCJjb2wteHMtNVwiPicsIHRleHRzWzBdLmZpbGVOYW1lLCAnPC90aD4nLFxuXHQgICAgICAgICAgJzx0aCBjbGFzcz1cImNvbC14cy01XCI+JywgdGV4dHNbMV0uZmlsZU5hbWUsICc8L3RoPicsXG5cdCAgICAgICAgJzwvdHI+Jyxcblx0ICAgICAgJzwvdGhlYWQ+Jyxcblx0ICAgICAgJzx0Ym9keT4nLFxuXHQgICAgICBcdCc8dHI+Jyxcblx0ICAgICAgICAgICc8dGg+Q29tbWVudDwvdGg+Jyxcblx0ICAgICAgICAgICc8dGQgaWQ9XCJwcmludC1jb21tZW50LTFcIj48L3RkPicsXG5cdCAgICAgICAgICAnPHRkIGlkPVwicHJpbnQtY29tbWVudC0yXCI+PC90ZD4nLFxuXHQgICAgICAgICc8L3RyPicsXG5cdCAgICAgICAgJzx0cj4nLFxuXHQgICAgICAgICAgJzx0aD5UeXBlPC90aD4nLFxuXHQgICAgICAgICAgJzx0ZD4nLCB0ZXh0c1swXS5pbnB1dE1vZGUsICc8L3RkPicsXG5cdCAgICAgICAgICAnPHRkPicsIHRleHRzWzFdLmlucHV0TW9kZSwgJzwvdGQ+Jyxcblx0ICAgICAgICAnPC90cj4nLFxuXHQgICAgICAgICc8dHI+Jyxcblx0ICAgICAgICAgICc8dGg+Q2hhcmFjdGVyczwvdGg+Jyxcblx0ICAgICAgICAgICc8dGQ+JywgdGV4dHNbMF0ubnJPZkNoYXJhY3RlcnMsICc8L3RkPicsXG5cdCAgICAgICAgICAnPHRkPicsIHRleHRzWzFdLm5yT2ZDaGFyYWN0ZXJzLCAnPC90ZD4nLFxuXHQgICAgICAgICc8L3RyPicsXG5cdCAgICAgICAgJzx0cj4nLFxuXHQgICAgICAgICAgJzx0aD5Xb3JkczwvdGg+Jyxcblx0ICAgICAgICAgICc8dGQ+JywgdGV4dHNbMF0ubnJPZldvcmRzLCAnPC90ZD4nLFxuXHQgICAgICAgICAgJzx0ZD4nLCB0ZXh0c1sxXS5uck9mV29yZHMsICc8L3RkPicsXG5cdCAgICAgICAgJzwvdHI+Jyxcblx0ICAgICAgICAnPHRyPicsXG5cdCAgICAgICAgICAnPHRoPlVuaXF1ZSBtYXRjaGVzPC90aD4nLFxuXHQgICAgICAgICAgJzx0ZCBjb2xzcGFuPVwiMlwiPicsIHVuaXF1ZU1hdGNoZXMsICc8L3RkPicsXG5cdCAgICAgICAgJzwvdHI+Jyxcblx0ICAgICAgJzwvdGJvZHk+Jyxcblx0XHQgICc8L3RhYmxlPidcblx0XHRdLmpvaW4oJycpO1xufTtcblxuLyoqXG4gKiBVcGRhdGVzIHRoZSBpbm5lciBIVE1MIGNvbnRlbnRcbiAqIG9mIHRoZSBub2RlIGVsZW1lbnQgdGhhdCBob2xkcyB0aGUgc3RhdGlzdGljYWwgZGF0YS4gXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl9ICB0ZXh0cyAgICAgICAgIC0gdGhlIGFycmF5IHRoYXQgaG9sZHMgaW5mb3JtYXRpb24gXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBhYm91dCB0aGUgdXNlciBpbnB1dFxuICogQHBhcmFtIHtOdW1iZXJ9IHVuaXF1ZU1hdGNoZXMgLSB0aGUgbnVtYmVyIG9mIHRoZSB1bmlxdWUgbWF0Y2hlcyBmb3VuZFxuICovXG5UZW1wbGF0ZS5wcm90b3R5cGUuY3JlYXRlU3RhdGlzdGljcyA9IGZ1bmN0aW9uKHRleHRzLCB1bmlxdWVNYXRjaGVzKSB7XG5cdHZhciB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RhdGlzdGljcycpO1xuXHRcdFxuXHR0YXJnZXQuaW5uZXJIVE1MID0gW1xuXHRcdCAgJzx0YWJsZSBjbGFzcz1cInRhYmxlIHRhYmxlLWNvbmRlbnNlZCB0YWJsZS1ib3JkZXJlZFwiPicsXG5cdCAgICAgICc8dGhlYWQ+JyxcbiAgICAgICAgICAnPHRyPicsXG4gICAgICAgICAgICAnPHRoIGNsYXNzPVwiY29sLXhzLTJcIj48L3RoPicsXG4gICAgICAgICAgICAnPHRoIGNsYXNzPVwiY29sLXhzLTVcIj4nLCB0ZXh0c1swXS5maWxlTmFtZSwgJzwvdGg+JyxcbiAgICAgICAgICAgICc8dGggY2xhc3M9XCJjb2wteHMtNVwiPicsIHRleHRzWzFdLmZpbGVOYW1lLCAnPC90aD4nLFxuICAgICAgICAgICc8L3RyPicsXG5cdCAgICAgICc8L3RoZWFkPicsXG5cdCAgICAgICc8dGJvZHk+JyxcbiAgICAgICAgICAnPHRyPicsXG4gICAgICAgICAgICAnPHRoPlR5cGU8L3RoPicsXG4gICAgICAgICAgICAnPHRkPicsIHRleHRzWzBdLmlucHV0TW9kZSwgJzwvdGQ+JyxcbiAgICAgICAgICAgICc8dGQ+JywgdGV4dHNbMV0uaW5wdXRNb2RlLCAnPC90ZD4nLFxuICAgICAgICAgICc8L3RyPicsXG4gICAgICAgICAgJzx0cj4nLFxuICAgICAgICAgICAgJzx0aD5DaGFyYWN0ZXJzPC90aD4nLFxuICAgICAgICAgICAgJzx0ZD4nLCB0ZXh0c1swXS5uck9mQ2hhcmFjdGVycywgJzwvdGQ+JyxcbiAgICAgICAgICAgICc8dGQ+JywgdGV4dHNbMV0ubnJPZkNoYXJhY3RlcnMsICc8L3RkPicsXG4gICAgICAgICAgJzwvdHI+JyxcbiAgICAgICAgICAnPHRyPicsXG4gICAgICAgICAgICAnPHRoPldvcmRzPC90aD4nLFxuICAgICAgICAgICAgJzx0ZD4nLCB0ZXh0c1swXS5uck9mV29yZHMsICc8L3RkPicsXG4gICAgICAgICAgICAnPHRkPicsIHRleHRzWzFdLm5yT2ZXb3JkcywgJzwvdGQ+JyxcbiAgICAgICAgICAnPC90cj4nLFxuICAgICAgICAgICc8dHI+JyxcbiAgICAgICAgICAgICc8dGg+VW5pcXVlIG1hdGNoZXM8L3RoPicsXG4gICAgICAgICAgICAnPHRkIGNvbHNwYW49XCIyXCI+JywgdW5pcXVlTWF0Y2hlcywgJzwvdGQ+JyxcbiAgICAgICAgICAnPC90cj4nLFxuXHQgICAgICAnPC90Ym9keT4nLFxuXHRcdCAgJzwvdGFibGU+J1xuXHRcdF0uam9pbignJyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRlbXBsYXRlOyIsIi8qIGpzaGludCB1bmRlZjp0cnVlLCB1bnVzZWQ6dHJ1ZSwgbm9kZTp0cnVlLCBicm93c2VyOnRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyICQgICAgICAgICAgID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJyQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJyQnXSA6IG51bGwpO1xudmFyIFRhcmdldE1hdGNoID0gcmVxdWlyZSgnLi4vYXV0b1Njcm9sbC90YXJnZXRNYXRjaC5qcycpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7Vmlld30sXG4gKiB3aGljaCBpbXBsZW1lbnRzIGFsbCB0aGUgVUkgbG9naWMgb2YgdGhlIGFwcGxpY2F0aW9uLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge1ZpZXd9XG4gKiBAcGFyYW0ge1RlbXBsYXRlfSB0ZW1wbGF0ZSAtIHRoZSBvYmplY3QgdGhhdCBhcHBlbmRzL3VwZGF0ZXMgZWxlbWVudHMgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpbiB0aGUgRE9NXG4gKi9cbmZ1bmN0aW9uIFZpZXcodGVtcGxhdGUpIHtcblx0dGhpcy50ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXHR0aGlzLnJlc3VsdHMgID0ge307XG5cdFxuXHQvLyBTZWxlY3RvcnNcblx0dGhpcy4kYWxlcnRzUGFuZWwgICAgICAgICAgPSAkKCcjYWxlcnRzLXBhbmVsJyk7XG5cdHRoaXMuJGNvbXBhcmVCdG4gICAgICAgICAgID0gJCgnI2NvbXBhcmUtYnRuJyk7XG5cdHRoaXMuJGNvbnRlbnRXcmFwcGVyICAgICAgID0gJCgnI2NvbnRlbnQtd3JhcHBlcicpO1xuXHR0aGlzLiRmaWxlICAgICAgICAgICAgICAgICA9ICQoJzpmaWxlJyk7XG5cdHRoaXMuJGh0bWxPcHRpb25zICAgICAgICAgID0gJCgnI2h0bWwtdGV4dC0xLCAjaHRtbC10ZXh0LTInKTtcblx0dGhpcy4kaW5wdXRMbmsgICAgICAgICAgICAgPSAkKCcjaW5wdXQtbG5rJyk7XG5cdHRoaXMuJGlucHV0UGFuZWwgICAgICAgICAgID0gJCgnI2lucHV0LXBhbmVsJyk7XG5cdHRoaXMuJGlucHV0UGFuZXMgICAgICAgICAgID0gJCgnI2lucHV0LXBhbmUtMSwgI2lucHV0LXBhbmUtMicpO1xuXHR0aGlzLiRpbnB1dEZpbGVzICAgICAgICAgICA9ICQoJyNpbnB1dC1maWxlLTEsICNpbnB1dC1maWxlLTInKTtcblx0dGhpcy4kaW5wdXRUZXh0cyAgICAgICAgICAgPSAkKCcjaW5wdXQtdGV4dC0xLCAjaW5wdXQtdGV4dC0yJyk7XG5cdHRoaXMuJG91dHB1dFBhbmVsICAgICAgICAgID0gJCgnI291dHB1dC1wYW5lbCcpO1xuXHR0aGlzLiRvdXRwdXRUZXh0cyAgICAgICAgICA9ICQoJyNjb21wYXJpc29uLW91dHB1dC0xLCAjY29tcGFyaXNvbi1vdXRwdXQtMicpO1xuXHR0aGlzLiRvdXRwdXRUZXh0Q29udGFpbmVycyA9ICQoJyNjb21wYXJpc29uLW91dHB1dC0xID4gLmNvbXBhcmlzb24tb3V0cHV0LWNvbnRhaW5lciwgI2NvbXBhcmlzb24tb3V0cHV0LTIgPiAuY29tcGFyaXNvbi1vdXRwdXQtY29udGFpbmVyJyk7XG5cdHRoaXMuJG91dHB1dFBhcmFncmFwaHMgICAgID0gJCgnI2NvbXBhcmlzb24tb3V0cHV0LTEgPiAuY29tcGFyaXNvbi1vdXRwdXQtY29udGFpbmVyID4gcCwgI2NvbXBhcmlzb24tb3V0cHV0LTIgPiAuY29tcGFyaXNvbi1vdXRwdXQtY29udGFpbmVyID4gcCcpO1xuXHR0aGlzLiRwcmludEJ0biAgICAgICAgICAgICA9ICQoJyNwcmludC1idG4nKTtcblx0dGhpcy4kc2V0dGluZ3NTaWRlYmFyICAgICAgPSAkKCcjc2V0dGluZ3Mtc2lkZWJhcicpO1xuXHR0aGlzLiRzZXR0aW5nc1NpZGViYXJMbmsgICA9ICQoJyNzZXR0aW5ncy1zaWRlYmFyLWxuaycpO1xuXHR0aGlzLiRzZXR0aW5nc1NpZGViYXJQYW5lcyA9ICQoJyNjb21wYXJpc29uLW9wdGlvbnMtcGFuZSwgI2lucHV0LW9wdGlvbnMtcGFuZScpO1xuXHR0aGlzLiRzcGlubmVyICAgICAgICAgICAgICA9ICQoJyNtaW4tbWF0Y2gtbGVuZ3RoLXNwaW5uZXInKTtcblx0dGhpcy4kdG9vbHRpcCAgICAgICAgICAgICAgPSAkKCdbZGF0YS10b2dnbGU9XCJ0b29sdGlwXCJdLCBbcmVsPVwidG9vbHRpcFwiXScpO1xuXHRcblx0dGhpcy5fcmVzZXRUZXh0SW5wdXRUYWJQYW5lcygpO1xuXHR0aGlzLl91cGRhdGVPdXRwdXRQYW5lbEhlaWdodCgpO1xuXHR0aGlzLl91cGRhdGVBbGVydHNQYW5lbFdpZHRoKCk7XG59XG5cbi8qKlxuICogQmluZHMgZXZlbnRzIGRlcGVuZGluZyBvbiB0aGUgbmFtZSBzcGVjaWZpZWQuXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAgICAgLSB0aGUgbmFtZSBvZiB0aGUgZXZlbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGhhbmRsZXIgLSB0aGUgY2FsbGJhY2sgZnVuY3Rpb25cbiAqL1xuVmlldy5wcm90b3R5cGUuYmluZCA9IGZ1bmN0aW9uKGV2ZW50LCBoYW5kbGVyKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0XG5cdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRjYXNlICdjaGFuZ2VTcGlubmVySW5wdXQnOlxuXHRcdFx0c2VsZi4kc3Bpbm5lclxuXHRcdFx0XHQub24oJ2NoYW5nZSBtb3VzZXdoZWVsIERPTU1vdXNlU2Nyb2xsJywgJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRcdFx0dmFyIGVsZW0gPSBlLnRhcmdldDtcblx0XHRcdFx0XHRcdHZhciBpZCA9IHNlbGYuX2dldElkKGVsZW0pO1xuXHRcdFx0XHQgIFx0XHR2YXIgbWluTWF0Y2hMZW5ndGggPSBwYXJzZUludCgkKGVsZW0pLnZhbCgpLCAxMCk7XG5cdFx0XHRcdCAgXHRcdFxuXHRcdFx0XHQgIFx0XHRpZiAoZS50eXBlID09PSAnbW91c2V3aGVlbCcgfHwgZS50eXBlID09PSAnRE9NTW91c2VTY3JvbGwnKSB7XG5cdFx0XHRcdFx0ICBcdFx0Ly8gc2Nyb2xsaW5nIHVwXG5cdFx0XHRcdCAgXHRcdFx0aWYgKGUub3JpZ2luYWxFdmVudC53aGVlbERlbHRhID4gMCB8fCBlLm9yaWdpbmFsRXZlbnQuZGV0YWlsIDwgMCkge1xuXHRcdFx0XHRcdFx0ICAgICAgICBtaW5NYXRjaExlbmd0aCArPSAxO1xuXHRcdFx0XHRcdFx0ICAgIH1cblx0XHRcdFx0XHRcdCAgICAvLyBzY3JvbGxpbmcgZG93blxuXHRcdFx0XHRcdFx0ICAgIGVsc2Uge1xuXHRcdFx0XHRcdFx0ICAgICAgICBtaW5NYXRjaExlbmd0aCAtPSAxO1xuXHRcdFx0XHRcdFx0ICAgIH1cblx0XHRcdFx0ICBcdFx0fVxuXHRcdFx0XHQgIFx0XHRcblx0XHRcdFx0ICBcdFx0bWluTWF0Y2hMZW5ndGggPSAobWluTWF0Y2hMZW5ndGggPCAxKSA/IDEgOiBtaW5NYXRjaExlbmd0aDsgXG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHRcdGhhbmRsZXIoaWQsIG1pbk1hdGNoTGVuZ3RoKTtcblx0XHRcdFx0ICAgIFx0c2VsZi51cGRhdGVVSU9wdGlvbihpZCwgJ2lucHV0VGV4dCcsIG1pbk1hdGNoTGVuZ3RoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdClcblx0XHRcdFx0Lm9uKCdjbGljaycsICcuYnRuJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0dmFyICRlbGVtID0gJChlLmRlbGVnYXRlVGFyZ2V0KS5maW5kKCdpbnB1dFt0eXBlPVwidGV4dFwiXScpO1xuXHRcdFx0XHRcdHZhciBpZCA9IHNlbGYuX2dldElkKCRlbGVtKTtcblx0XHQgIFx0XHR2YXIgbWluTWF0Y2hMZW5ndGggPSBwYXJzZUludCgkZWxlbS52YWwoKSwgMTApO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdGlmICgkKGUuY3VycmVudFRhcmdldCkuaGFzQ2xhc3MoJ3BsdXMnKSkge1xuXHRcdFx0XHRcdFx0bWluTWF0Y2hMZW5ndGggKz0gMTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWluTWF0Y2hMZW5ndGggPSAobWluTWF0Y2hMZW5ndGggPiAxKSA/IChtaW5NYXRjaExlbmd0aCAtIDEpIDogbWluTWF0Y2hMZW5ndGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdGhhbmRsZXIoaWQsIG1pbk1hdGNoTGVuZ3RoKTtcblx0XHRcdFx0ICAgIHNlbGYudXBkYXRlVUlPcHRpb24oaWQsICdpbnB1dFRleHQnLCBtaW5NYXRjaExlbmd0aCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRjYXNlICdjb21wYXJlJzpcblx0XHRcdHNlbGYuJGNvbXBhcmVCdG4ub24oJ2NsaWNrJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcblx0XHRcdFx0JCh0aGlzKS50b29sdGlwKCdoaWRlJyk7XG5cdFx0XHRcdHNlbGYuJHNldHRpbmdzU2lkZWJhci5yZW1vdmVDbGFzcygnZXhwYW5kZWQnKTtcblx0XHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRoYW5kbGVyKCk7XG5cdFx0XHRcdH0sIDIwMCk7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXHRcdFxuXHRcdGNhc2UgJ2Rpc21pc3NBbGVydCc6XG5cdFx0XHRzZWxmLiRhbGVydHNQYW5lbC5vbignY2xpY2snLCAnLmFsZXJ0JywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdCQodGhpcykucmVtb3ZlKCk7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAnaW5pdEJvb3RzdHJhcCc6XG5cdFx0XHRzZWxmLiR0b29sdGlwLnRvb2x0aXAoe1xuXHRcdFx0XHRjb250YWluZXIgOiAnYm9keScsXG5cdFx0XHRcdGRlbGF5ICAgICA6IHsgXCJzaG93XCI6IDgwMCwgXCJoaWRlXCI6IDAgfSxcblx0XHRcdFx0aHRtbCAgICAgIDogdHJ1ZSxcblx0XHRcdFx0cGxhY2VtZW50IDogJ2JvdHRvbScsXG5cdFx0XHRcdHRyaWdnZXIgICA6ICdob3Zlcidcblx0XHRcdH0pO1xuXHRcdFx0XG5cdFx0XHRzZWxmLiRmaWxlLmZpbGVzdHlsZSh7XG5cdFx0XHRcdGJ1dHRvbk5hbWUgIDogXCJidG4tcHJpbWFyeVwiLFxuXHRcdFx0XHRidXR0b25UZXh0ICA6IFwiQnJvd3NlIGZpbGVcIixcblx0XHRcdFx0cGxhY2Vob2xkZXIgOiBcIk5vIGZpbGUgc2VsZWN0ZWRcIixcblx0XHRcdFx0c2l6ZSAgICAgICAgOiBcInNtXCJcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRjYXNlICdpbnB1dEZpbGUnOlxuXHRcdFx0c2VsZi4kaW5wdXRGaWxlcy5vbignY2hhbmdlJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHR2YXIgZWxlbSA9IGUudGFyZ2V0O1xuXHRcdFx0XHR2YXIgaWQgPSBzZWxmLl9nZXRJZChlbGVtKTtcblx0XHRcdFx0XG5cdFx0XHRcdHZhciB0YWJQYW5lSWQgPSBzZWxmLl9nZXRJZCgkKGVsZW0pLnBhcmVudHMoJy50YWItcGFuZScpKTtcblx0XHRcdFx0c2VsZi50b2dnbGVFcnJvclN0YXR1cygnaGlkZScsIHRhYlBhbmVJZCk7XG5cdFx0XHRcdFxuXHRcdFx0XHR2YXIgZmlsZSA9IGVsZW0uZmlsZXNbMF07XG5cdFx0XHRcdHZhciBpZHggPSBzZWxmLl9nZXRJbmRleChpZCk7XG5cdFx0XHRcdHZhciBsb2FkaW5nRWxlbSA9ICQoZWxlbSkucGFyZW50KCk7XG5cdFx0XHRcdGhhbmRsZXIoZmlsZSwgaWR4LCBsb2FkaW5nRWxlbSwgdGFiUGFuZUlkKTtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XG5cdFx0Y2FzZSAnaW5wdXRUZXh0Jzpcblx0XHRcdHNlbGYuJGlucHV0VGV4dHMub24oJ2NoYW5nZSBpbnB1dCcsIGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0dmFyIGVsZW0gPSBlLnRhcmdldDtcblx0XHRcdFx0dmFyICRlbGVtID0gJChlbGVtKTtcblx0XHRcdFx0dmFyIHRhYlBhbmVJZCA9IHNlbGYuX2dldElkKCRlbGVtLnBhcmVudHMoJy50YWItcGFuZScpKTtcblx0XHRcdFx0XG5cdFx0XHRcdGlmIChlLnR5cGUgPT09ICdpbnB1dCcpIHtcblx0XHRcdFx0XHRzZWxmLnRvZ2dsZUVycm9yU3RhdHVzKCdoaWRlJywgdGFiUGFuZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRcblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gJ2NoYW5nZScpIHtcblx0XHRcdFx0XHR2YXIgaWQgPSBzZWxmLl9nZXRJZChlbGVtKTtcblx0XHRcdFx0XHR2YXIgdGV4dCA9ICRlbGVtLnZhbCgpO1xuXHRcdFx0XHRcdHZhciBpZHggPSBzZWxmLl9nZXRJbmRleChpZCk7XG5cdFx0XHRcdFx0aGFuZGxlcih0ZXh0LCBpZHgsIHRhYlBhbmVJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRjYXNlICdoaWRlUHJpbnREaWFsb2cnOlxuXHRcdFx0c2VsZi4kY29udGVudFdyYXBwZXIub24oJ2hpZGUuYnMubW9kYWwnLCAnLm1vZGFsJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRzZWxmLl90b2dnbGVQcmludERpYWxvZygnaGlkZScsIGUudGFyZ2V0KTtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XG5cdFx0Y2FzZSAncHJpbnQnOlxuXHRcdFx0c2VsZi4kY29udGVudFdyYXBwZXIub24oJ2NsaWNrJywgJyNtb2RhbC1wcmludC1idG4nLCBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFxuXHRcdFx0XHR2YXIgaW5wdXRDb21tZW50MSAgPSAkKCcjaW5wdXQtY29tbWVudC0xJykudmFsKCk7XG5cdFx0XHRcdHZhciBpbnB1dENvbW1lbnQyICA9ICQoJyNpbnB1dC1jb21tZW50LTInKS52YWwoKTtcblx0XHRcdFx0JCgnI3ByaW50LWNvbW1lbnQtMScpLnRleHQoaW5wdXRDb21tZW50MSk7XG5cdFx0XHRcdCQoJyNwcmludC1jb21tZW50LTInKS50ZXh0KGlucHV0Q29tbWVudDIpO1xuXHRcdFx0XHRcblx0XHRcdFx0dmFyIGhpZGVNb2RhbFByb21pc2UgPSAkKCcubW9kYWwnKS5tb2RhbCgnaGlkZScpLnByb21pc2UoKTtcblx0XHRcdFx0aGFuZGxlcihoaWRlTW9kYWxQcm9taXNlKTtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XG5cdFx0Y2FzZSAncmVzaXplJzpcblx0XHRcdCQod2luZG93KS5vbigncmVzaXplJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHNlbGYuX3VwZGF0ZU91dHB1dFBhbmVsSGVpZ2h0KCk7XG5cdFx0XHRcdHNlbGYuX3VwZGF0ZUFsZXJ0c1BhbmVsV2lkdGgoKTtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRjYXNlICdzY3JvbGxUb01hdGNoJzpcblx0XHRcdHNlbGYuJG91dHB1dFRleHRzLm9uKCdjbGljaycsICdhJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFxuXHRcdFx0XHR2YXIgdGFyZ2V0TWF0Y2ggPSBuZXcgVGFyZ2V0TWF0Y2goZS50YXJnZXQpO1xuXHRcdFx0XHR2YXIgc2Nyb2xsUG9zaXRpb24gPSB0YXJnZXRNYXRjaC5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0XHR0YXJnZXRNYXRjaC5zY3JvbGwoc2Nyb2xsUG9zaXRpb24pO1xuXHRcdFx0fSk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGNhc2UgJ3NlbGVjdEhUTUxPcHRpb24nOlxuXHRcdFx0c2VsZi4kaW5wdXRQYW5lbC5vbignY2hhbmdlJywgJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScsIGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0dmFyIGVsZW0gPSBlLnRhcmdldDtcblx0XHRcdFx0dmFyIGlkID0gc2VsZi5fZ2V0SWQoZWxlbSk7XG5cdFx0XHRcdHZhciBpZHggPSBzZWxmLl9nZXRJbmRleChpZCk7XG5cdFx0XHRcdHZhciBuZXdWYWx1ZSA9ICQoZWxlbSkucHJvcCgnY2hlY2tlZCcpO1xuXHRcdFx0XHR2YXIgdGV4dCA9IHNlbGYuJGlucHV0VGV4dHMuZXEoaWR4KS52YWwoKTtcblx0XHRcdFx0aGFuZGxlcihpZHgsIG5ld1ZhbHVlLCB0ZXh0KTtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRjYXNlICdzZWxlY3RTZXR0aW5nc09wdGlvbic6XG5cdFx0XHRzZWxmLiRzZXR0aW5nc1NpZGViYXJQYW5lcy5vbignY2hhbmdlJywgJ2lucHV0W3R5cGU9XCJjaGVja2JveFwiXScsIGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0dmFyIGVsZW0gPSBlLnRhcmdldDtcblx0XHRcdFx0dmFyIGlkID0gc2VsZi5fZ2V0SWQoZWxlbSk7XG5cdFx0XHRcdHZhciBuZXdWYWx1ZSA9ICQoZWxlbSkucHJvcCgnY2hlY2tlZCcpO1xuXHRcdFx0XHRoYW5kbGVyKGlkLCBuZXdWYWx1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAnc2VsZWN0VGFiJzpcblx0XHRcdHNlbGYuJGlucHV0UGFuZXMub24oJ3Nob3duLmJzLnRhYicsICdhW2RhdGEtdG9nZ2xlPVwidGFiXCJdJywgZnVuY3Rpb24oZSkge1xuXHRcdFx0XHR2YXIgbGFzdFRhYlBhbmVJZCA9ICQoZS5yZWxhdGVkVGFyZ2V0KS5hdHRyKCdocmVmJyk7XG5cdFx0XHRcdHNlbGYudG9nZ2xlRXJyb3JTdGF0dXMoJ2hpZGUnLCBsYXN0VGFiUGFuZUlkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGNhc2UgJ3Nob3dQcmludERpYWxvZyc6XG5cdFx0XHRzZWxmLiRwcmludEJ0bi5vbignY2xpY2snLCBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHNlbGYuX3RvZ2dsZVByaW50RGlhbG9nKCdzaG93Jyk7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAndG9nZ2xlSW5wdXRQYW5lbCc6XG5cdFx0XHRzZWxmLiRpbnB1dExuay5vbignY2xpY2snLCBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Ly8gSGlkZSB0b29sdGlwIChpZiBhbnkpXG5cdFx0XHRcdCQodGhpcykudG9vbHRpcCgnaGlkZScpO1xuXHRcdFx0XHRzZWxmLl90b2dnbGVJbnB1dFBhbmVsKCd0b2dnbGUnKTtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRjYXNlICd0b2dnbGVTZXR0aW5nc1NpZGViYXInOlxuXHRcdFx0c2VsZi4kc2V0dGluZ3NTaWRlYmFyTG5rLm9uKCdjbGljaycsIGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHQvLyBIaWRlIHRvb2x0aXAgKGlmIGFueSlcblx0XHRcdFx0JCh0aGlzKS50b29sdGlwKCdoaWRlJyk7XG5cdFx0XHRcdHNlbGYuJHNldHRpbmdzU2lkZWJhci50b2dnbGVDbGFzcygnZXhwYW5kZWQnKTtcblx0XHRcdH0pO1xuXHRcdFxuXHRcdFx0Ly8gSGlkZSBzZXR0aW5ncyBzaWRlYmFyIHdoZW4gY2xpY2tpbmcgaW5zaWRlIHRoZSAnbmF2JyBhbmQgJyNjb250ZW50LXdyYXBwZXInIGVsZW1lbnRzXG5cdFx0XHQkKCdib2R5Jykub24oJ2NsaWNrJywgJ25hdiwgI2NvbnRlbnQtd3JhcHBlcicsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRzZWxmLiRzZXR0aW5nc1NpZGViYXIucmVtb3ZlQ2xhc3MoJ2V4cGFuZGVkJyk7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAndG9nZ2xlU2V0dGluZ3NTaWRlYmFyUGFuZXMnOlxuXHRcdFx0c2VsZi4kc2V0dGluZ3NTaWRlYmFyLm9uKCdjbGljaycsICcucGFuZWwtdGl0bGUnLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0JCh0aGlzKS50b2dnbGVDbGFzcygnYWN0aXZlJyk7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXZlbnQgdHlwZSBub3QgdmFsaWQuJyk7XG5cdH1cbn07XG5cbi8qKlxuICogUmVtb3ZlcyBhbGwgPHA+IG5vZGVzIGZyb20gZWFjaCBvdXRwdXQgcGFuZVxuICogYW5kIGhpZGVzIHRoZSBvdXRwdXQgcGFuZWwuXG4gKiBAZnVuY3Rpb25cbiAqL1xuVmlldy5wcm90b3R5cGUuY2xlYXJPdXRwdXRQYW5lbCA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHRzZWxmLiRvdXRwdXRQYXJhZ3JhcGhzLmVhY2goZnVuY3Rpb24oKSB7XG5cdFx0JCh0aGlzKS5yZW1vdmUoKTtcblx0fSk7XG5cdHNlbGYuX3RvZ2dsZU91dHB1dFBhbmVsKCdoaWRlJyk7XG5cdHNlbGYudG9nZ2xlV2FpdGluZ0N1cnNvcignaGlkZScpO1xufTtcblxuLyoqXG4gKiBDbGVhcnMgYWxsIGlucHV0IGZyb20gdGhlIFwiRklMRVwiIHRhYiBwYW5lLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge051bWJlcn0gaWR4IC0gdGhlIG51bWJlciBvZiB0aGUgdGFiIHBhbmVcbiAqICAgICAgICAgICAgICAgICAgICAgICAwOiBmb3IgbGVmdC1zaWRlIHBhbmUsIDE6IGZvciByaWdodC1zaWRlIHBhbmVcbiAqL1xuVmlldy5wcm90b3R5cGUuY2xlYXJUYWJQYW5lRmlsZUlucHV0ID0gZnVuY3Rpb24oaWR4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIHRhYlBhbmVJZCA9ICcjdGFiLWZpbGUtJyArIChpZHggKyAxKTtcblx0JCh0YWJQYW5lSWQgKyAnIGlucHV0JykuZmlsZXN0eWxlKCdjbGVhcicpO1xuXHRzZWxmLnRvZ2dsZUVycm9yU3RhdHVzKCdoaWRlJywgdGFiUGFuZUlkKTtcblx0c2VsZi5sb2FkaW5nKCdjYW5jZWwnLCB0YWJQYW5lSWQpO1xufTtcblxuLyoqXG4gKiBDbGVhcnMgYWxsIGlucHV0IGZyb20gdGhlIFwiVEVYVFwiIHRhYiBwYW5lLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge051bWJlcn0gaWR4IC0gdGhlIG51bWJlciBvZiB0aGUgdGFiIHBhbmVcbiAqICAgICAgICAgICAgICAgICAgICAgICAwOiBmb3IgbGVmdC1zaWRlIHBhbmUsIDE6IGZvciByaWdodC1zaWRlIHBhbmVcbiAqL1xuVmlldy5wcm90b3R5cGUuY2xlYXJUYWJQYW5lVGV4dElucHV0ID0gZnVuY3Rpb24oaWR4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIHRhYlBhbmVJZCA9ICcjdGFiLXRleHQtJyArIChpZHggKyAxKTtcblx0JCh0YWJQYW5lSWQgKyAnIHRleHRhcmVhJykudmFsKCcnKTtcblx0c2VsZi50b2dnbGVFcnJvclN0YXR1cygnaGlkZScsIHRhYlBhbmVJZCk7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgdGhlIG5vZGUgdGVtcGxhdGVzLlxuICogQGZ1bmN0aW9uXG4gKi9cblZpZXcucHJvdG90eXBlLmNyZWF0ZVRlbXBsYXRlcyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYudGVtcGxhdGUuY3JlYXRlUHJpbnRTdW1tYXJ5KHNlbGYucmVzdWx0cy50ZXh0cywgc2VsZi5yZXN1bHRzLnVuaXF1ZU1hdGNoZXMpO1xuXHRzZWxmLnRlbXBsYXRlLmNyZWF0ZVN0YXRpc3RpY3Moc2VsZi5yZXN1bHRzLnRleHRzLCBzZWxmLnJlc3VsdHMudW5pcXVlTWF0Y2hlcyk7XG5cdHNlbGYudGVtcGxhdGUuY3JlYXRlT3V0cHV0VGl0bGVzKHNlbGYucmVzdWx0cy50ZXh0cyk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGlkcyBvZiBhY3RpdmUgdGFiIHBhbmVzIGFzIGFuIGFycmF5IG9mIHN0cmluZ3MuXG4gKiBAZnVuY3Rpb25cbiAqIEByZXR1cm5zIHtBcnJheTxTdHJpbmc+fSAtIHRoZSBpZHMgb2YgdGhlIGFjdGl2ZSB0YWIgcGFuZXNcbiAqL1xuVmlldy5wcm90b3R5cGUuZ2V0QWN0aXZlVGFiUGFuZUlkcyA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0dGFiUGFuZUlkcyA9IFtdO1xuXHRcdFxuXHQkKCcudGFiLXBhbmUuYWN0aXZlJykuZWFjaChmdW5jdGlvbigpIHtcblx0XHR2YXIgdGFiUGFuZUlkID0gc2VsZi5fZ2V0SWQodGhpcyk7XG5cdFx0dGFiUGFuZUlkcy5wdXNoKHRhYlBhbmVJZCk7XG5cdH0pO1xuXHRyZXR1cm4gdGFiUGFuZUlkcztcbn07XG5cbi8qKlxuICogU2hvd3MvaGlkZXMgYW4gbm9kZSBlbGVtZW50IGRlcGVuZGluZyBvbiB0aGUgZXZlbnQgc3BlY2lmaWVkLlxuICogVXNlZCB0byBzaG93IHRoZSBwcm9ncmVzcyBvZiBhIHByb2Nlc3MgKGUuZy4gaW5wdXQgcmVhZGluZykuXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAgLSB0aGUgbmFtZSBvZiB0aGUgZXZlbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQgLSB0aGUgaWQgb2YgdGhlIG5vZGUgZWxlbWVudFxuICovXG5WaWV3LnByb3RvdHlwZS5sb2FkaW5nID0gZnVuY3Rpb24oZXZlbnQsIHRhcmdldCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHRzd2l0Y2ggKGV2ZW50KSB7XG5cdFx0Y2FzZSAnc3RhcnQnOlxuXHRcdFx0c2VsZi50b2dnbGVDb21wYXJlQnRuKCdkaXNhYmxlJyk7XG5cdFx0XHQkKHRhcmdldCkuZmluZCgnLmZhJykuYWRkQ2xhc3MoJ2hpZGRlbicpO1xuXHRcdFx0JCh0YXJnZXQpLmZpbmQoJy5mYS1zcGlubmVyJykucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuXHRcdFx0YnJlYWs7XG5cdFx0XG5cdFx0Y2FzZSAnZG9uZSc6XG5cdFx0XHRzZWxmLnRvZ2dsZUNvbXBhcmVCdG4oJ2VuYWJsZScpO1xuXHRcdFx0JCh0YXJnZXQpLmZpbmQoJy5mYScpLmFkZENsYXNzKCdoaWRkZW4nKTtcblx0XHRcdCQodGFyZ2V0KS5maW5kKCcuZmEtY2hlY2snKS5yZW1vdmVDbGFzcygnaGlkZGVuJyk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGNhc2UgJ2NhbmNlbCc6XG5cdFx0XHRzZWxmLnRvZ2dsZUNvbXBhcmVCdG4oJ2VuYWJsZScpO1xuXHRcdFx0JCh0YXJnZXQpLmZpbmQoJy5mYScpLmFkZENsYXNzKCdoaWRkZW4nKTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0c2VsZi50b2dnbGVDb21wYXJlQnRuKCdlbmFibGUnKTtcblx0XHRcdCQodGFyZ2V0KS5maW5kKCcuZmEnKS5hZGRDbGFzcygnaGlkZGVuJyk7XG5cdFx0XHQkKHRhcmdldCkuZmluZCgnLmZhLXRpbWVzJykucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFdmVudCB0eXBlIG5vdCB2YWxpZC4nKTsgXG5cdH1cbn07XG5cbi8qKlxuICogUmVzZXRzIHRoZSBzY3JvbGwgYmFycy5cbiAqIEBmdW5jdGlvblxuICovXG5WaWV3LnByb3RvdHlwZS5yZXNldFNjcm9sbGJhcnMgPSBmdW5jdGlvbigpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLiRvdXRwdXRUZXh0cy5zY3JvbGxUb3AoMCk7XG59O1xuXG4vKipcbiAqIENsZWFycyB0ZXh0IGZyb20gdGV4dGFyZWEgYW5kIHVuY2hlY2tzIGNoZWNrYm94ZXMuXG4gKiBJbXBvcnRhbnQgZm9yIEludGVybmV0IEV4cGxvcmVyLCBcbiAqIHNpbmNlIGl0IGRvZXMgbm90IHJlY29nbml6ZSB0aGUgXCJhdXRvY29tcGxldGU9J29mZidcIiBhdHRyaWJ1dGUuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKi9cblZpZXcucHJvdG90eXBlLl9yZXNldFRleHRJbnB1dFRhYlBhbmVzID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0c2VsZi4kaHRtbE9wdGlvbnMucHJvcCgnY2hlY2tlZCcsIGZhbHNlKTtcblx0c2VsZi4kaW5wdXRUZXh0cy52YWwoJycpO1xufTtcblxuLyoqXG4gKiBEaXNwbGF5cyBhIHdhcm5pbmcgbWVzc2FnZS5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgICAgLSB0aGUgdHlwZSBvZiB0aGUgbWVzc2FnZVxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgLSB0aGUgdGV4dCBvZiB0aGUgbWVzc2FnZVxuICogQHBhcmFtIHtOdW1iZXJ9IGRlbGF5ICAgLSB0aGUgdGltZSBpbiBtaWxsaXNlY29uZHMsIGR1cmluZyB3aGljaCB0aGUgbWVzc2FnZSBcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgc2hvdWxkIHJlbWFpbiB2aXNpYmxlXG4gKi9cblZpZXcucHJvdG90eXBlLnNob3dBbGVydE1lc3NhZ2UgPSBmdW5jdGlvbih0eXBlLCBtZXNzYWdlLCBkZWxheSkge1xuXHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0XHRhbGVydE1lc3NhZ2UgPSBzZWxmLnRlbXBsYXRlLmNyZWF0ZUFsZXJ0TWVzc2FnZSh0eXBlLCBtZXNzYWdlKTtcblx0XG5cdHNlbGYuJGFsZXJ0c1BhbmVsLmFwcGVuZCgkKGFsZXJ0TWVzc2FnZSkpO1xuXHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdHNlbGYuJGFsZXJ0c1BhbmVsLmNoaWxkcmVuKCkuZXEoMCkucmVtb3ZlKCk7XG5cdH0sIGRlbGF5KTtcbn07XG5cbi8qKlxuICogQXBwZW5kcyB0aGUgYXJyYXkgb2Ygbm9kZXMgcmV0dXJuZWQgYnkgdGhlIGNvbXBhcmlzb24gXG4gKiB0byB0aGUgPHA+IG5vZGUgZWxlbWVudCBvZiBlYWNoIG91dHB1dCBwYW5lIFxuICogYW5kIHNob3dzIHRoZSBvdXRwdXQgcGFuZWwuXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl9IG5vZGVzIC0gdGhlIGFycmF5IG9mIG5vZGVzIHJldHVybmVkIGJ5IHRoZSBjb21wYXJpc29uXG4gKi9cblZpZXcucHJvdG90eXBlLnNob3dTaW1pbGFyaXRpZXMgPSBmdW5jdGlvbihub2Rlcykge1xuXHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0XHRuTGVuZ3RoID0gbm9kZXMubGVuZ3RoO1xuXHRcdFxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG5MZW5ndGg7IGkrKykge1xuXHRcdHZhciAkcCA9ICQoJzxwPicpLmFwcGVuZChub2Rlc1tpXSk7XG5cdFx0c2VsZi4kb3V0cHV0VGV4dENvbnRhaW5lcnMuZXEoaSkuaHRtbCgkcCk7XG5cdH1cblx0XG5cdHNlbGYuX3RvZ2dsZU91dHB1dFBhbmVsKCdzaG93Jyk7XG5cdHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG5cdFx0c2VsZi5fdG9nZ2xlSW5wdXRQYW5lbCgnaGlkZScpO1xuXHR9LCAxMDApO1xuXHRcblx0c2VsZi50b2dnbGVXYWl0aW5nQ3Vyc29yKCdoaWRlJyk7XG59O1xuXG4vKipcbiAqIEVuYWJsZXMvZGlzYWJsZXMgdGhlIGNvbXBhcmUgYnV0dG9uXG4gKiBkZXBlbmRpbmcgb24gdGhlIGV2ZW50IHNwZWNpZmllZC5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50IC0gdGhlIG5hbWUgb2YgdGhlIGV2ZW50XG4gKi9cblZpZXcucHJvdG90eXBlLnRvZ2dsZUNvbXBhcmVCdG4gPSBmdW5jdGlvbihldmVudCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRjYXNlICdlbmFibGUnOlxuXHRcdFx0c2VsZi4kY29tcGFyZUJ0bi5wcm9wKCdkaXNhYmxlZCcsIGZhbHNlKTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAnZGlzYWJsZSc6XG5cdFx0XHRzZWxmLiRjb21wYXJlQnRuLnByb3AoJ2Rpc2FibGVkJywgdHJ1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFdmVudCB0eXBlIG5vdCB2YWxpZC4nKTsgXG5cdH1cbn07XG5cbi8qKlxuICogVG9nZ2xlcyB0aGUgY2xhc3MgXCJoYXMtZXJyb3JcIiwgXG4gKiB3aGljaCBhcHBsaWVzIGEgcmVkIGJvcmRlciBhcm91bmQgaW5wdXQgbm9kZSBlbGVtZW50cyxcbiAqIHRvIHByb21wdCB0aGUgdXNlciBpbiBjYXNlIG9mIGVycm9uZW91cyBpbnB1dC5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50ICAgICAtIHRoZSBuYW1lIG9mIHRoZSBldmVudFxuICogQHBhcmFtIHtTdHJpbmd9IHRhYlBhbmVJZCAtIHRoZSBpZCBvZiB0aGUgdGFiIHBhbmVcbiAqL1xuVmlldy5wcm90b3R5cGUudG9nZ2xlRXJyb3JTdGF0dXMgPSBmdW5jdGlvbihldmVudCwgdGFiUGFuZUlkKSB7XG5cdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRjYXNlICdzaG93Jzpcblx0XHRcdCQodGFiUGFuZUlkICsgJyAuYXBwbHktZXJyb3InKS5hZGRDbGFzcygnaGFzLWVycm9yJyk7XG5cdFx0XHRicmVhaztcblx0XHRcblx0XHRjYXNlICdoaWRlJzpcblx0XHRcdCQodGFiUGFuZUlkICsgJyAuYXBwbHktZXJyb3InKS5yZW1vdmVDbGFzcygnaGFzLWVycm9yJyk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V2ZW50IHR5cGUgbm90IHZhbGlkLicpOyBcblx0fVxufTtcblxuLyoqXG4gKiBUb2dnbGVzIHRoZSBzdHlsZSBvZiB0aGUgY3Vyc29yIChmcm9tIFwiZGVmYXVsdFwiIHRvIFwid2FpdGluZ1wiLCBhbmQgdmljZSB2ZXJzYSlcbiAqIGRlcGVuZGluZyBvbiB0aGUgZXZlbnQgc3BlY2lmaWVkLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSB0aGUgbmFtZSBvZiB0aGUgZXZlbnRcbiAqL1xuVmlldy5wcm90b3R5cGUudG9nZ2xlV2FpdGluZ0N1cnNvciA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRjYXNlICdzaG93Jzpcblx0XHRcdGRvY3VtZW50LmJvZHkuY2xhc3NOYW1lID0gJ3dhaXRpbmcnO1xuXHRcdFx0YnJlYWs7XG5cdFx0XG5cdFx0Y2FzZSAnaGlkZSc6XG5cdFx0XHRkb2N1bWVudC5ib2R5LmNsYXNzTmFtZSA9ICcnO1xuXHRcdFx0YnJlYWs7XG5cdFx0XHRcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFdmVudCB0eXBlIG5vdCB2YWxpZC4nKTtcblx0fVxufTtcblxuLyoqXG4gKiBVcGRhdGVzIHRoZSB2YWx1ZSBvZiBhIHNldHRpbmcgaW4gdGhlIFVJLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gICAgICAgICAgIGlkICAgIC0gdGhlIGlkIG9mIHRoZSBjb250cm9sIGVsZW1lbnQgXG4gKiBAcGFyYW0ge1N0cmluZ30gICAgICAgICAgIHR5cGUgIC0gdGhlIHR5cGUgb2YgdGhlIGNvbnRyb2wgZWxlbWVudFxuICogQHBhcmFtIHsoQm9vbGVhbnxOdW1iZXIpfSB2YWx1ZSAtIHRoZSB2YWx1ZSBvZiB0aGUgc2V0dGluZ1xuICovXG5WaWV3LnByb3RvdHlwZS51cGRhdGVVSU9wdGlvbiA9IGZ1bmN0aW9uKGlkLCB0eXBlLCB2YWx1ZSkge1xuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlICdjaGVja2JveCc6XG5cdFx0XHQkKGlkKS5wcm9wKCdjaGVja2VkJywgdmFsdWUpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSAnc2VsZWN0Jzpcblx0XHRcdCQoaWQpLnZhbCh2YWx1ZSk7XG5cdFx0XHRicmVhaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0JChpZCkudmFsKHZhbHVlKTtcblx0fVxufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBoZWlnaHQgb2YgdGhlIG91dHB1dCBwYW5lXG4gKiBzbyB0aGF0IGl0IGZpdHMgZW50aXJlbHkgaW4gdGhlIHdpbmRvdy5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqL1xuVmlldy5wcm90b3R5cGUuX2NvbXB1dGVPdXRwdXRQYW5lbEhlaWdodCA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBib2R5SGVpZ2h0ID0gJCgnYm9keScpLm91dGVySGVpZ2h0KHRydWUpO1xuXHR2YXIgb3V0cHV0UG9zICA9IHNlbGYuJG91dHB1dFBhbmVsLm9mZnNldCgpLnRvcDtcblx0dmFyIG91dHB1dFRvcFBhZGRpbmcgPSBwYXJzZUludChzZWxmLiRvdXRwdXRQYW5lbC5jc3MoJ3BhZGRpbmctdG9wJyksIDEwKTtcblx0dmFyIGVsZW1Qb3MgICAgPSBzZWxmLiRvdXRwdXRUZXh0cy5lcSgwKS5vZmZzZXQoKS50b3A7XG5cdHZhciBwb3NPZmZzZXQgID0gKGVsZW1Qb3MgLSBvdXRwdXRQb3MpO1xuXHRyZXR1cm4gYm9keUhlaWdodCAtIG91dHB1dFBvcyAtIChwb3NPZmZzZXQgKyBvdXRwdXRUb3BQYWRkaW5nKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaWQgb2YgYSBub2RlIGVsZW1lbnQgYXMgYSBzdHJpbmcgKGUuZy4gXCIjaWRcIikuXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSAgIHtPYmplY3R9IHRhcmdldCAtIHRoZSBpZCBvZiB0aGUgbm9kZSBlbGVtZW50XG4gKiBAcmV0dXJucyB7U3RyaW5nfSAgICAgICAgLSB0aGUgc3RyaW5nIG9mIHRoZSBub2RlIGVsZW1lbnQncyBpZCBcbiAqL1xuVmlldy5wcm90b3R5cGUuX2dldElkID0gZnVuY3Rpb24odGFyZ2V0KSB7XG5cdHJldHVybiAnIycgKyAkKHRhcmdldCkuYXR0cignaWQnKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbnVtYmVyIGNvbnRhaW5lZCBpbiB0aGUgaWQgb2YgYSBub2RlIGVsZW1lbnQuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0gICB7U3RyaW5nfSBpZCAtIHRoZSBpZCBvZiB0aGUgbm9kZSBlbGVtZW50XG4gKiBAcmV0dXJucyB7TnVtYmVyfSAgICAtIHRoZSBudW1iZXIgb2YgdGhlIGlkXG4gKi9cblZpZXcucHJvdG90eXBlLl9nZXRJbmRleCA9IGZ1bmN0aW9uKGlkKSB7XG5cdHZhciB0b2tlbnMgPSBpZC5zcGxpdCgnLScpOyBcblx0dmFyIGlkeCA9IHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV07XG5cdHJldHVybiBwYXJzZUludChpZHgsIDEwKSAtIDE7XG59O1xuXG5WaWV3LnByb3RvdHlwZS5fdG9nZ2xlSW5wdXRQYW5lbCA9IGZ1bmN0aW9uKGV2ZW50KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0c3dpdGNoIChldmVudCkge1xuXHRcdGNhc2UgJ3RvZ2dsZSc6XG5cdFx0XHQkKCcuYnRuLWdyb3VwLm9wZW4nKS5yZW1vdmVDbGFzcygnb3BlbicpO1xuXHRcdFx0c2VsZi4kaW5wdXRQYW5lbC50b2dnbGVDbGFzcygnZXhwYW5kZWQnKTtcblx0XHRcdGJyZWFrO1xuXHRcdFxuXHRcdGNhc2UgJ2hpZGUnOlxuXHRcdFx0c2VsZi4kaW5wdXRQYW5lbC5yZW1vdmVDbGFzcygnZXhwYW5kZWQnKTtcblx0XHRcdGJyZWFrO1xuXHRcdFxuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V2ZW50IHR5cGUgbm90IHZhbGlkLicpO1xuXHR9XG59O1xuXG4vKipcbiAqIFNob3dzL2hpZGVzIHRoZSBvdXRwdXQgcGFuZWwgZGVwZW5kaW5nIG9uIHRoZSBldmVudCBzcGVjaWZpZWQuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSB0aGUgbmFtZSBvZiB0aGUgZXZlbnRcbiAqL1xuVmlldy5wcm90b3R5cGUuX3RvZ2dsZU91dHB1dFBhbmVsID0gZnVuY3Rpb24oZXZlbnQpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzd2l0Y2ggKGV2ZW50KSB7XG5cdFx0Y2FzZSAnc2hvdyc6XG5cdFx0XHRzZWxmLiRvdXRwdXRQYW5lbC5yZW1vdmVDbGFzcygnaW52aXNpYmxlJyk7XG5cdFx0XHRicmVhaztcblx0XHRcblx0XHRjYXNlICdoaWRlJzpcblx0XHRcdHNlbGYuJG91dHB1dFBhbmVsLmFkZENsYXNzKCdpbnZpc2libGUnKTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXZlbnQgdHlwZSBub3QgdmFsaWQuJyk7IFxuXHR9XG59O1xuXG4vKipcbiAqIFNob3dzL2hpZGVzIHRoZSBcIlBSSU5UIE9VVFBVVFwiIGRpYWxvZyBkZXBlbmRpbmcgb24gdGhlIGV2ZW50IHNwZWNpZmllZC5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCAgLSB0aGUgbmFtZSBvZiB0aGUgZXZlbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSB0YXJnZXQgLSB0aGUgbm9kZSBlbGVtZW50IHRvIGJlIHJlbW92ZWRcbiAqL1xuVmlldy5wcm90b3R5cGUuX3RvZ2dsZVByaW50RGlhbG9nID0gZnVuY3Rpb24oZXZlbnQsIHRhcmdldCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRjYXNlICdzaG93Jzpcblx0XHRcdHZhciAkcHJpbnREaWFsb2cgPSAkKHNlbGYudGVtcGxhdGUuY3JlYXRlUHJpbnREaWFsb2coc2VsZi5yZXN1bHRzLnRleHRzKSk7XG5cdFx0XHRzZWxmLiRjb250ZW50V3JhcHBlci5hcHBlbmQoJHByaW50RGlhbG9nKTtcblx0XHRcdCRwcmludERpYWxvZy5tb2RhbCgnc2hvdycpO1xuXHRcdFx0YnJlYWs7XG5cdFx0XG5cdFx0Y2FzZSAnaGlkZSc6XG5cdFx0XHQkKHRhcmdldCkucmVtb3ZlKCk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V2ZW50IHR5cGUgbm90IHZhbGlkLicpO1xuXHR9XG59O1xuXG4vKipcbiAqIFVwZGF0ZXMgdGhlIHdpZHRoIG9mIHRoZSBhbGVydHMnIHBhbmVsLlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICovXG5WaWV3LnByb3RvdHlwZS5fdXBkYXRlQWxlcnRzUGFuZWxXaWR0aCA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiAgICAgICAgPSB0aGlzLFxuXHRcdFx0bWFyZ2luTFIgICAgICA9IDMgKiAyLFxuXHRcdFx0bmF2V2lkdGggICAgICA9ICQoJ25hdicpLndpZHRoKCksXG5cdFx0XHRuYXZMZWZ0V2lkdGggID0gJCgnbmF2IC5wdWxsLWxlZnQnKS5vdXRlcldpZHRoKCksXG5cdFx0XHRuYXZSaWdodFdpZHRoID0gJCgnbmF2IC5wdWxsLXJpZ2h0Jykub3V0ZXJXaWR0aCgpLFxuXHRcdFx0bWF4V2lkdGggICAgICA9IG5hdldpZHRoIC0gKG5hdkxlZnRXaWR0aCArIG5hdlJpZ2h0V2lkdGggKyBtYXJnaW5MUik7XG5cdFx0XG5cdHNlbGYuJGFsZXJ0c1BhbmVsLmNzcyh7XG5cdFx0J2xlZnQnICAgICAgOiBuYXZMZWZ0V2lkdGggKyAncHgnLFxuXHRcdCdtYXgtd2lkdGgnIDogbWF4V2lkdGggKyAncHgnXG5cdH0pO1xufTtcblxuLyoqXG4gKiBVcGRhdGVzIHRoZSBoZWlnaHQgb2YgZWFjaCBvdXRwdXQgcGFuZS5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqL1xuVmlldy5wcm90b3R5cGUuX3VwZGF0ZU91dHB1dFBhbmVsSGVpZ2h0ID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdGggPSBzZWxmLl9jb21wdXRlT3V0cHV0UGFuZWxIZWlnaHQoKTtcblxuXHRzZWxmLiRvdXRwdXRUZXh0cy5lYWNoKGZ1bmN0aW9uKCkge1xuXHRcdCQodGhpcykuY3NzKCdoZWlnaHQnLCBoICsgJ3B4Jyk7XG5cdH0pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBWaWV3O1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7U2Nyb2xsUG9zaXRpb259LlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge1Njcm9sbFBvc2l0aW9ufVxuICogQHBhcmFtIHtOdW1iZXJ9IHRvcFBhZGRpbmcgICAgLSB0aGUgdG9wIHBhZGRpbmdcbiAqIEBwYXJhbSB7TnVtYmVyfSBib3R0b21QYWRkaW5nIC0gdGhlIGJvdHRvbSBwYWRkaW5nXG4gKiBAcGFyYW0ge051bWJlcn0geVBvc2l0aW9uICAgICAtIHRoZSB2ZXJ0aWNhbCBwb3NpdGlvbiBvZiB0aGUgc2Nyb2xsIGJhclxuICovXG5mdW5jdGlvbiBTY3JvbGxQb3NpdGlvbih0b3BQYWRkaW5nLCBib3R0b21QYWRkaW5nLCB5UG9zaXRpb24pIHtcblx0dGhpcy50b3BQYWRkaW5nICAgID0gdG9wUGFkZGluZztcblx0dGhpcy5ib3R0b21QYWRkaW5nID0gYm90dG9tUGFkZGluZztcblx0dGhpcy55UG9zaXRpb24gICAgID0geVBvc2l0aW9uO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFNjcm9sbFBvc2l0aW9uO1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgJCAgICAgICAgICAgICAgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snJCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnJCddIDogbnVsbCk7XG52YXIgU2Nyb2xsUG9zaXRpb24gPSByZXF1aXJlKCcuL3Njcm9sbFBvc2l0aW9uLmpzJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBpbnN0YW5jZSBvZiBhIHtUYXJnZXRNYXRjaH0sXG4gKiB3aGljaCBob2xkIGluZm9ybWF0aW9uIG9uIHRoZSB0YXJnZXQgbWF0Y2ggbm9kZSBlbGVtZW50LlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge1RhcmdldE1hdGNofVxuICogQHBhcmFtIHtlbGVtfSBlbGVtIC0gdGhlIHNvdXJjZSBtYXRjaCBub2RlXG4gKi9cbmZ1bmN0aW9uIFRhcmdldE1hdGNoKGVsZW0pIHtcblx0dGhpcy4kc3JjRWxlbSAgICAgICAgICAgICA9ICQoZWxlbSk7XG5cdHRoaXMuJHNyY1BhcmVudCAgICAgICAgICAgPSAkKHRoaXMuJHNyY0VsZW0ucGFyZW50KCkucGFyZW50KCkucGFyZW50KCkpO1xuXHRcblx0dGhpcy4kZWxlbSAgICAgICAgICAgICAgICA9ICQodGhpcy4kc3JjRWxlbS5hdHRyKCdocmVmJykpO1xuXHR0aGlzLiR3cmFwcGVyICAgICAgICAgICAgID0gJCh0aGlzLiRlbGVtLnBhcmVudCgpKTtcblx0dGhpcy4kY29udGFpbmVyICAgICAgICAgICA9ICQodGhpcy4kd3JhcHBlci5wYXJlbnQoKSk7XG5cdHRoaXMuJHBhcmVudCAgICAgICAgICAgICAgPSAkKHRoaXMuJGNvbnRhaW5lci5wYXJlbnQoKSk7XG5cdFxuXHR0aGlzLnBhcmVudEhlaWdodCAgICAgICAgID0gdGhpcy4kcGFyZW50WzBdLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmhlaWdodDtcblx0dGhpcy5jb250YWluZXJUQlBhZGRpbmcgICA9IHBhcnNlSW50KHRoaXMuJGNvbnRhaW5lci5jc3MoJ3BhZGRpbmctdG9wJyksIDEwKSArIHBhcnNlSW50KHRoaXMuJGNvbnRhaW5lci5jc3MoJ3BhZGRpbmctYm90dG9tJyksIDEwKTtcblx0dGhpcy53cmFwcGVyVG9wUGFkZGluZyAgICA9IHBhcnNlRmxvYXQodGhpcy4kd3JhcHBlci5jc3MoJ3BhZGRpbmctdG9wJykpO1xuXHR0aGlzLndyYXBwZXJCb3R0b21QYWRkaW5nID0gcGFyc2VGbG9hdCh0aGlzLiR3cmFwcGVyLmNzcygncGFkZGluZy1ib3R0b20nKSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmV3IHNjcm9sbCBwb3NpdGlvbiBvZiB0aGUgdGFyZ2V0IG1hdGNoIG5vZGUuXG4gKiBAZnVuY3Rpb25cbiAqIEByZXR1cm5zIHtTY3JvbGxQb3NpdGlvbn0gLSB0aGUgbmV3IHNjcm9sbCBwb3NpdGlvblxuICovXG5UYXJnZXRNYXRjaC5wcm90b3R5cGUuZ2V0U2Nyb2xsUG9zaXRpb24gPSBmdW5jdGlvbigpIHtcblx0dmFyIHNlbGYgICAgICAgICAgICAgICAgID0gdGhpcyxcblx0ICAgIHdyYXBwZXJCb3R0b20gICAgICAgID0gc2VsZi4kd3JhcHBlci5vdXRlckhlaWdodCh0cnVlKSArIHNlbGYuY29udGFpbmVyVEJQYWRkaW5nLFxuXHQgICAgd3JhcHBlclRvcFBhZGRpbmcgICAgPSBzZWxmLndyYXBwZXJUb3BQYWRkaW5nLFxuXHQgICAgd3JhcHBlckJvdHRvbVBhZGRpbmcgPSBzZWxmLndyYXBwZXJCb3R0b21QYWRkaW5nLFxuXHQgICAgLy8gQ2FsY3VsYXRlIGRpZmZlcmVuY2Ugb24gdGhlIHkgYXhpcyAocmVsYXRpdmUgdG8gcGFyZW50IGVsZW1lbnQpXG5cdCAgICB5UG9zRGlmZiAgICAgICAgICAgICA9IChzZWxmLiRzcmNFbGVtLm9mZnNldCgpLnRvcCAtIHNlbGYuJHNyY1BhcmVudC5vZmZzZXQoKS50b3ApIC0gKHNlbGYuJGVsZW0ub2Zmc2V0KCkudG9wIC0gc2VsZi4kcGFyZW50Lm9mZnNldCgpLnRvcCk7XG5cdFxuXHQvLyBSZW1vdmUgdG9wIHBhZGRpbmdcblx0aWYgKHdyYXBwZXJUb3BQYWRkaW5nID4gMCkge1xuXHRcdHlQb3NEaWZmICs9IHdyYXBwZXJUb3BQYWRkaW5nO1xuXHRcdHdyYXBwZXJCb3R0b20gLT0gd3JhcHBlclRvcFBhZGRpbmc7XG5cdFx0d3JhcHBlclRvcFBhZGRpbmcgPSAwO1xuXHR9XG5cdFxuXHQvLyBSZW1vdmUgYm90dG9tIHBhZGRpbmdcblx0aWYgKHdyYXBwZXJCb3R0b21QYWRkaW5nID4gMCkge1xuXHRcdHdyYXBwZXJCb3R0b20gLT0gd3JhcHBlckJvdHRvbVBhZGRpbmc7XG5cdFx0d3JhcHBlckJvdHRvbVBhZGRpbmcgPSAwO1xuXHR9XG5cdFxuXHQvLyBDb21wdXRlIG5ldyBzY3JvbGwgcG9zaXRpb25cblx0dmFyIHlTY3JvbGxQb3MgPSBzZWxmLiRwYXJlbnQuc2Nyb2xsVG9wKCkgLSB5UG9zRGlmZjsgXG5cdFxuXHQvLyBBZGQgYm90dG9tIHBhZGRpbmcsIGlmIG5lZWRlZFxuXHRpZiAoeVNjcm9sbFBvcyA+ICh3cmFwcGVyQm90dG9tIC0gc2VsZi5wYXJlbnRIZWlnaHQpKSB7XG5cdFx0dmFyIGJvdHRvbU9mZnNldCA9ICh5U2Nyb2xsUG9zICsgc2VsZi5wYXJlbnRIZWlnaHQpIC0gKHdyYXBwZXJCb3R0b20pO1xuXHRcdHdyYXBwZXJCb3R0b21QYWRkaW5nID0gTWF0aC5hYnMoYm90dG9tT2Zmc2V0KTtcblx0fVxuXHRcblx0Ly8gQWRkIHRvcCBwYWRkaW5nLCBpZiBuZWVkZWRcblx0aWYgKHlTY3JvbGxQb3MgPCAwKSB7XG5cdFx0dmFyIHRvcE9mZnNldCA9IHlTY3JvbGxQb3M7XG5cdFx0d3JhcHBlclRvcFBhZGRpbmcgPSBNYXRoLmFicyh0b3BPZmZzZXQpO1xuXHRcdHlTY3JvbGxQb3MgLT0gdG9wT2Zmc2V0O1xuXHR9XG5cdFxuXHRyZXR1cm4gbmV3IFNjcm9sbFBvc2l0aW9uKHdyYXBwZXJUb3BQYWRkaW5nLCB3cmFwcGVyQm90dG9tUGFkZGluZywgeVNjcm9sbFBvcyk7XG59O1xuXG4vKipcbiAqIEFuaW1hdGVzIHNjcm9sbGluZyB0byB0aGUgbmV3IHBvc2l0aW9uLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1Njcm9sbFBvc2l0aW9ufSBzY3JvbGxQb3NpdGlvbiAtIHRoZSBuZXcgc2Nyb2xsIHBvc2l0aW9uXG4gKi9cblRhcmdldE1hdGNoLnByb3RvdHlwZS5zY3JvbGwgPSBmdW5jdGlvbihzY3JvbGxQb3NpdGlvbikge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdFxuXHRzZWxmLiR3cmFwcGVyLmFuaW1hdGUoe1xuXHRcdCdwYWRkaW5nLXRvcCcgICAgOiBzY3JvbGxQb3NpdGlvbi50b3BQYWRkaW5nLFxuXHRcdCdwYWRkaW5nLWJvdHRvbScgOiBzY3JvbGxQb3NpdGlvbi5ib3R0b21QYWRkaW5nLFxuXHR9LCA3MDApO1xuXHRcblx0c2VsZi4kcGFyZW50LmFuaW1hdGUoe1xuXHRcdCdzY3JvbGxUb3AnICAgICAgOiBzY3JvbGxQb3NpdGlvbi55UG9zaXRpb24sXG5cdH0sIDcwMCk7XG5cdFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBUYXJnZXRNYXRjaDsiLCIvKiBqc2hpbnQgdW5kZWY6dHJ1ZSwgdW51c2VkOnRydWUsIG5vZGU6dHJ1ZSwgYnJvd3Nlcjp0cnVlICovXG4ndXNlIHN0cmljdCc7XG5cbnZhciAkICAgICA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcbnZhciBKU1ppcCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydKU1ppcCddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnSlNaaXAnXSA6IG51bGwpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7RmlsZUlucHV0UmVhZGVyfSxcbiAqIHdoaWNoIHBhcnNlcyBhbmQgZXh0cmFjdHMgdGhlIHRleHQgY29udGVudHMgb2YgdGhlIERPQ1gsIE9EVCBhbmQgVFhUIGZpbGVzLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge0ZpbGVJbnB1dFJlYWRlcn1cbiAqIEBwYXJhbSB7RmlsZX0gICAgZmlsZSAgICAgICAgICAgIC0gdGhlIGZpbGUgc2VsZWN0ZWQgYnkgdGhlIHVzZXJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gaWdub3JlRm9vdG5vdGVzIC0gdGhlIG9wdGlvbiBmb3IgaW5jbHVkaW5nL2V4Y2x1ZGluZyBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRoZSBkb2N1bWVudCdzIGZvb3Rub3RlcyBmcm9tIHBhcnNpbmdcbiAqL1xuZnVuY3Rpb24gRmlsZUlucHV0UmVhZGVyKGZpbGUsIGlnbm9yZUZvb3Rub3Rlcykge1xuXHR0aGlzLmZpbGUgICAgICAgICAgICA9IGZpbGU7XG5cdHRoaXMuaWdub3JlRm9vdG5vdGVzID0gaWdub3JlRm9vdG5vdGVzO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFuZGxlcyB0aGUgZmlsZSByZWFkaW5nLlxuICogV2hlbiByZXNvbHZlZCwgdGhlIGNvbnRlbnRzIG9mIHRoZSBmaWxlIGFyZSByZXR1cm5lZCBhcyBhIHN0cmluZy4gXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSAgIHtGdW5jdGlvbn0gbG9hZGluZ1N0YXJ0ZWQgLSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24gXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgIGZvciB0aGUgb25sb2Fkc3RhcnQgZXZlbnRcbiAqIEByZXR1cm5zIHtQcm9taXNlfSBcbiAqL1xuRmlsZUlucHV0UmVhZGVyLnByb3RvdHlwZS5yZWFkRmlsZUlucHV0ID0gZnVuY3Rpb24obG9hZGluZ1N0YXJ0ZWQpIHtcblx0dmFyIHNlbGYgICAgID0gdGhpcyxcblx0XHRcdGZpbGUgICAgID0gc2VsZi5maWxlLFxuXHRcdFx0ZmlsZVR5cGUgPSBzZWxmLl9nZXRGaWxlVHlwZSgpLFxuXHRcdFx0ZGVmZXJyZWQgPSAkLkRlZmVycmVkKCksXG5cdFx0XHRmciAgICAgICA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cdFxuXHRmci5vbmVycm9yID0gZnVuY3Rpb24oZSkge1xuXHRcdHZhciBlcnJvciA9IGUudGFyZ2V0LmVycm9yO1xuXHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0Y2FzZSBlcnJvci5OT1RfRk9VTkRfRVJSOlxuXHRcdFx0XHRkZWZlcnJlZC5yZWplY3QoJ0ZpbGUgbm90IGZvdW5kIScpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgZXJyb3IuTk9UX1JFQURBQkxFX0VSUjpcblx0XHRcdFx0ZGVmZXJyZWQucmVqZWN0KCdGaWxlIG5vdCByZWFkYWJsZS4nKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIGVycm9yLkFCT1JUX0VSUjpcblx0XHRcdFx0ZGVmZXJyZWQucmVqZWN0KCdGaWxlIHJlYWRpbmcgYWJvcnRlZC4nKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRkZWZlcnJlZC5yZWplY3QoJ0FuIGVycm9yIG9jY3VycmVkIHdoaWxlIHJlYWRpbmcgdGhpcyBmaWxlLicpO1xuXHRcdH1cblx0fTtcblx0XG5cdGZyLm9ubG9hZHN0YXJ0ID0gbG9hZGluZ1N0YXJ0ZWQ7XG5cdFxuXHRzd2l0Y2ggKGZpbGVUeXBlKSB7XG5cdFx0Y2FzZSAnZG9jeCc6XG5cdFx0XHRmci5vbmxvYWQgPSBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdHZhciBkb2N4VGV4dCA9IHNlbGYuX3JlYWRET0NYKGUudGFyZ2V0LnJlc3VsdCk7XG5cdFx0XHRcdFxuXHRcdFx0XHRpZiAoZG9jeFRleHQpIHtcblx0XHRcdFx0XHRpZiAoL1xcUy8udGVzdChkb2N4VGV4dCkpIHtcblx0XHRcdFx0XHRcdGRlZmVycmVkLnJlc29sdmUoZG9jeFRleHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkZWZlcnJlZC5yZWplY3QoJ1RoZSBzZWxlY3RlZCBET0NYIGZpbGUgaXMgZW1wdHkuJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlZmVycmVkLnJlamVjdCgnVGhlIHNlbGVjdGVkIGZpbGUgaXMgbm90IGEgdmFsaWQgRE9DWCBmaWxlLicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0ZnIucmVhZEFzQXJyYXlCdWZmZXIoZmlsZSk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGNhc2UgJ29kdCc6XG5cdFx0XHRmci5vbmxvYWQgPSBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdHZhciBvZHRUZXh0ID0gc2VsZi5fcmVhZE9EVChlLnRhcmdldC5yZXN1bHQpO1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKG9kdFRleHQpIHtcblx0XHRcdFx0XHRpZiAoL1xcUy8udGVzdChvZHRUZXh0KSkge1xuXHRcdFx0XHRcdFx0ZGVmZXJyZWQucmVzb2x2ZShvZHRUZXh0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGVmZXJyZWQucmVqZWN0KCdUaGUgc2VsZWN0ZWQgT0RUIGZpbGUgaXMgZW1wdHkuJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlZmVycmVkLnJlamVjdCgnVGhlIHNlbGVjdGVkIGZpbGUgaXMgbm90IGEgdmFsaWQgT0RUIGZpbGUuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRmci5yZWFkQXNBcnJheUJ1ZmZlcihmaWxlKTtcblx0XHRcdGJyZWFrO1xuXHRcdFx0XG5cdFx0Y2FzZSAndHh0Jzpcblx0XHRcdGZyLm9ubG9hZCA9IGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0dmFyIHR4dFRleHQgPSBlLnRhcmdldC5yZXN1bHQ7XG5cdFx0XHRcdFxuXHRcdFx0XHRpZiAodHh0VGV4dCkge1xuXHRcdFx0XHRcdGlmICgvXFxTLy50ZXN0KHR4dFRleHQpKSB7XG5cdFx0XHRcdFx0XHQvLyBNYWMgdXNlcyBjYXJyaWFnZSByZXR1cm4sIHdoaWNoIGlzIG5vdCBwcm9jZXNzZWQgY29ycmVjdGx5XG5cdFx0XHRcdFx0XHQvLyBSZXBsYWNlIGVhY2ggY2FycmlhZ2UgcmV0dXJuLCBub3QgZm9sbG93ZWQgYnkgYSBsaW5lIGZlZWRcblx0XHRcdFx0XHRcdC8vIHdpdGggYSBsaW5lIGZlZWRcblx0XHRcdFx0XHRcdHZhciBjckNsZWFuZWRUZXh0ID0gdHh0VGV4dC5yZXBsYWNlKC9cXHIoPyFcXG4pL2csICdcXG4nKTtcblx0XHRcdFx0XHRcdGRlZmVycmVkLnJlc29sdmUoY3JDbGVhbmVkVGV4dCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGRlZmVycmVkLnJlamVjdCgnVGhlIHNlbGVjdGVkIFRYVCBmaWxlIGlzIGVtcHR5LicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGZyLnJlYWRBc1RleHQoZmlsZSk7XG5cdFx0XHRicmVhaztcblx0XHRcdFxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRkZWZlcnJlZC5yZWplY3QoJ0ZpbGUgdHlwZSBub3Qgc3VwcG9ydGVkLicpO1xuXHR9XG5cdFxuXHRyZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xufTtcblxuLyoqXG4gKiBUcmF2ZXJzZXMgcmVjdXJzaXZlbHkgYWxsIGNoaWxkcmVuIHN0YXJ0aW5nIGZyb20gdGhlIHRvcCBYTUwgbm9kZSxcbiAqIGlycmVzcGVjdGl2ZSBvZiBob3cgZGVlcCB0aGUgbmVzdGluZyBpcy5cbiAqIFJldHVybnMgdGhlaXIgdGV4dCBjb250ZW50cyBhcyBhIHN0cmluZy5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSAgIHtPYmplY3R9IG5vZGUgICAgICAgLSB0aGUgdG9wIFhNTCBub2RlIGVsZW1lbnRcbiAqIEBwYXJhbSAgIHtTdHJpbmd9IHRTZWxlY3RvciAgLSB0aGUgc2VsZWN0b3IgZm9yIHRleHQgZWxlbWVudHNcbiAqIEBwYXJhbSAgIHtTdHJpbmd9IGJyU2VsZWN0b3IgLSB0aGUgc2VsZWN0b3IgZm9yIHNvZnQgbGluZSBicmVha3NcbiAqIEByZXR1cm5zIHtTdHJpbmd9ICAgICAgICAgICAgLSB0aGUgdGV4dCBjb250ZW50IG9mIHRoZSBub2RlXG4gKi9cbkZpbGVJbnB1dFJlYWRlci5wcm90b3R5cGUuX2V4dHJhY3RUZXh0RnJvbU5vZGUgPSBmdW5jdGlvbihub2RlLCB0U2VsZWN0b3IsIGJyU2VsZWN0b3IpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0Ly8gUGFyYWdyYXBoIHNlbGVjdG9ycyBmb3IgYm90aCBET0NYIGFuZCBPRFQsIFxuXHRcdFx0Ly8gc3VwcG9ydGVkIGJvdGggYnkgQ2hyb21lIGFuZCBvdGhlciBicm93c2Vyc1xuXHRcdFx0Ly8gQ2hyb21lIHVzZXMgZGlmZmVyZW50IHNlbGVjdG9ycyBcblx0XHRcdGRlbGltZXRlcnMgPSB7XG5cdFx0XHRcdCd3OnAnICAgIDogJ1xcbicsXG5cdFx0XHRcdCd0ZXh0OnAnIDogJ1xcbicsXG5cdFx0XHRcdCdwJyAgICAgIDogJ1xcbidcblx0XHRcdH0sXG5cdFx0XHRkZWxpbWV0ZXIgPSBkZWxpbWV0ZXJzW25vZGUubm9kZU5hbWVdIHx8ICcnLFxuXHRcdFx0c3RyICA9ICcnO1xuXHRcdFxuXHRpZiAobm9kZS5oYXNDaGlsZE5vZGVzKCkpIHtcblx0XHR2YXIgY2hpbGQgPSBub2RlLmZpcnN0Q2hpbGQ7XG5cdFx0XG5cdFx0d2hpbGUgKGNoaWxkKSB7XG5cdFx0XHQvLyBUaGVzZSBzZWxlY3RvcnMgYXBwbHkgb25seSB0byB0aGUgZm9vdG5vdGVzIG9mIE9EVCBmaWxlc1xuXHRcdFx0Ly8gRm9vdG5vdGVzIHNob3VsZCBhcHBlYXIgYWxsIHRvZ2V0aGVyIGF0IHRoZSBlbmQgb2YgdGhlIGV4dHJhY3RlZCB0ZXh0IFxuXHRcdFx0Ly8gYW5kIG5vdCBpbnNpZGUgdGhlIHRleHQgYXQgdGhlIHBvaW50IHdoZXJlIHRoZSByZWZlcmVuY2UgaXMuXG5cdFx0XHRpZiAoY2hpbGQubm9kZU5hbWUgPT09ICd0ZXh0Om5vdGUnIHx8IGNoaWxkLm5vZGVOYW1lID09PSAnbm90ZScpIHtcblx0XHRcdFx0Y2hpbGQgPSBjaGlsZC5uZXh0U2libGluZztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdGlmIChjaGlsZC5ub2RlTmFtZSA9PT0gdFNlbGVjdG9yKSB7XG5cdFx0XHRcdHN0ciArPSBjaGlsZC50ZXh0Q29udGVudDtcblx0XHRcdH0gZWxzZSBpZiAoY2hpbGQubm9kZU5hbWUgPT09IGJyU2VsZWN0b3IpIHtcblx0XHRcdFx0c3RyICs9ICdcXG4nO1xuXHRcdFx0fSBcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRzdHIgKz0gc2VsZi5fZXh0cmFjdFRleHRGcm9tTm9kZShjaGlsZCwgdFNlbGVjdG9yLCBiclNlbGVjdG9yKTtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Y2hpbGQgPSBjaGlsZC5uZXh0U2libGluZztcblx0XHR9XG5cdH1cblx0XG5cdHJldHVybiBzdHIgKyBkZWxpbWV0ZXI7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHR5cGUgb2YgZmlsZSBkZXBlbmRpbmcgb24gdGhlIGZpbGUncyBleHRlbnNpb24uXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0gICB7T2JqZWN0fSBmaWxlIC0gdGhlIGZpbGUgc2VsZWN0ZWQgYnkgdGhlIHVzZXJcbiAqIEByZXR1cm5zIHtTdHJpbmd9ICAgICAgLSB0aGUgdHlwZSBvZiBmaWxlXG4gKi9cbkZpbGVJbnB1dFJlYWRlci5wcm90b3R5cGUuX2dldEZpbGVUeXBlID0gZnVuY3Rpb24oKSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdGZpbGUgPSBzZWxmLmZpbGU7XG5cdFxuXHRpZiAoL2RvY3gkL2kudGVzdChmaWxlLm5hbWUpKSB7XG5cdFx0cmV0dXJuICdkb2N4Jztcblx0fVxuXHRcblx0aWYgKC9vZHQkL2kudGVzdChmaWxlLm5hbWUpKSB7XG5cdFx0cmV0dXJuICdvZHQnO1xuXHR9XG5cdFxuXHRpZiAoL3R4dCQvaS50ZXN0KGZpbGUubmFtZSkpIHtcblx0XHRyZXR1cm4gJ3R4dCc7XG5cdH1cblx0XG5cdHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGNvbnRlbnRzIG9mIGFsbCBYTUwgbm9kZXMgYXMgYSBzdHJpbmcuXG4gKiBcbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSAgIHtPYmplY3RbXX0gbm9kZXMgICAgLSB0aGUgYXJyYXkgb2YgWE1MIG5vZGVzXG4gKiBAcGFyYW0gICB7U3RyaW5nfSB0U2VsZWN0b3IgIC0gdGhlIHNlbGVjdG9yIGZvciB0ZXh0IGVsZW1lbnRzXG4gKiBAcGFyYW0gICB7U3RyaW5nfSBiclNlbGVjdG9yIC0gdGhlIHNlbGVjdG9yIGZvciBzb2Z0IGxpbmUgYnJlYWtzXG4gKiBAcmV0dXJucyB7U3RyaW5nfSAgICAgICAgICAgIC0gdGhlIHRleHQgY29udGVudCBvZiBhbGwgWE1MIG5vZGVzXG4gKi9cbkZpbGVJbnB1dFJlYWRlci5wcm90b3R5cGUuX2dldFRleHRDb250ZW50ID0gZnVuY3Rpb24obm9kZXMsIHRTZWxlY3RvciwgYnJTZWxlY3Rvcikge1xuXHR2YXIgc2VsZiAgICA9IHRoaXMsXG5cdFx0XHRuTGVuZ3RoID0gbm9kZXMubGVuZ3RoLFxuXHRcdFx0dGV4dENvbnRlbnQ7XG5cdFxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG5MZW5ndGg7IGkrKykge1xuXHRcdHZhciBub2RlID0gbm9kZXNbaV07XG5cdFx0dmFyIG5vZGVDb250ZW50ID0gc2VsZi5fZXh0cmFjdFRleHRGcm9tTm9kZShub2RlLCB0U2VsZWN0b3IsIGJyU2VsZWN0b3IpO1xuXHRcdHRleHRDb250ZW50ID0gW3RleHRDb250ZW50LCBub2RlQ29udGVudF0uam9pbignJyk7XG5cdH1cblx0XG5cdHJldHVybiB0ZXh0Q29udGVudDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgY29udGVudHMgb2YgdGhlIERPQ1ggZmlsZSBhcyBhIHN0cmluZy5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSAgIHtPYmplY3R9IGZpbGVDb250ZW50cyAtIHRoZSBjb250ZW50cyBvZiB0aGUgZmlsZSBvYmplY3RcbiAqIEByZXR1cm5zIHtTdHJpbmd9ICAgICAgICAgICAgICAtIHRoZSB0ZXh0IG9mIHRoZSBET0NYIGZpbGVcbiAqL1xuRmlsZUlucHV0UmVhZGVyLnByb3RvdHlwZS5fcmVhZERPQ1ggPSBmdW5jdGlvbihmaWxlQ29udGVudHMpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0ZG9jdW1lbnQsXG5cdFx0XHRmb290bm90ZXMgID0gJycsXG5cdFx0XHR4bWxEb2MsXG5cdFx0XHR0U2VsZWN0b3IgID0gJ3c6dCcsXG5cdFx0XHRiclNlbGVjdG9yID0gJ3c6YnInLFxuXHRcdFx0emlwO1xuXG5cdC8vIFVuemlwIHRoZSBmaWxlXG5cdHRyeSB7XG5cdFx0emlwID0gbmV3IEpTWmlwKGZpbGVDb250ZW50cyk7XG5cdFxuXHRcdC8vIFJlYWQgdGhlIG1haW4gdGV4dCBvZiB0aGUgRE9DWCBmaWxlXG5cdFx0dmFyIGZpbGUgPSB6aXAuZmlsZXNbJ3dvcmQvZG9jdW1lbnQueG1sJ107XG5cdFx0XHRcblx0XHRpZiAoZmlsZSkge1xuXHRcdFx0eG1sRG9jID0gJC5wYXJzZVhNTChmaWxlLmFzVGV4dCgpKTtcblx0XHRcdHZhciBwTm9kZXMgPSAkKHhtbERvYykuZmluZCgnd1xcXFw6Ym9keSwgYm9keScpLmNoaWxkcmVuKCk7XG5cdFx0XHRkb2N1bWVudCA9IHNlbGYuX2dldFRleHRDb250ZW50KHBOb2RlcywgdFNlbGVjdG9yLCBiclNlbGVjdG9yKTtcblx0XHR9XG5cdFx0XG5cdFx0Ly8gUmVhZCBmb290bm90ZXMvZW5kbm90ZXNcblx0XHRpZiAoIXNlbGYuaWdub3JlRm9vdG5vdGVzKSB7XG5cdFx0XHQvLyBSZWFkIGZvb3Rub3Rlc1xuXHRcdFx0ZmlsZSA9IHppcC5maWxlc1snd29yZC9mb290bm90ZXMueG1sJ107XG5cdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHR4bWxEb2MgPSAkLnBhcnNlWE1MKGZpbGUuYXNUZXh0KCkpO1xuXHRcdFx0XHR2YXIgZk5vZGVzID0gJCh4bWxEb2MpLmZpbmQoJ3dcXFxcOmZvb3Rub3RlcywgZm9vdG5vdGVzJykuY2hpbGRyZW4oJ3dcXFxcOmZvb3Rub3RlOm5vdChbd1xcXFw6dHlwZV0pLCBmb290bm90ZTpub3QoW3R5cGVdKScpO1xuXHRcdFx0XHR2YXIgZk5vZGVzVGV4dCA9IHNlbGYuX2dldFRleHRDb250ZW50KGZOb2RlcywgdFNlbGVjdG9yLCBiclNlbGVjdG9yKTtcblx0XHRcdFx0aWYgKGZOb2Rlc1RleHQpIHtcblx0XHRcdFx0XHRmb290bm90ZXMgPSBbZm9vdG5vdGVzLCBmTm9kZXNUZXh0XS5qb2luKCcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHQvLyBSZWFkIGVuZG5vdGVzXG5cdFx0XHRmaWxlID0gemlwLmZpbGVzWyd3b3JkL2VuZG5vdGVzLnhtbCddO1xuXHRcdFx0aWYgKGZpbGUpIHtcblx0XHRcdFx0eG1sRG9jID0gJC5wYXJzZVhNTChmaWxlLmFzVGV4dCgpKTtcblx0XHRcdFx0dmFyIGVOb2RlcyA9ICQoeG1sRG9jKS5maW5kKCd3XFxcXDplbmRub3RlcywgZW5kbm90ZXMnKS5jaGlsZHJlbignd1xcXFw6ZW5kbm90ZTpub3QoW3dcXFxcOnR5cGVdKSwgZW5kbm90ZTpub3QoW3R5cGVdKScpO1xuXHRcdFx0XHR2YXIgZU5vZGVzVGV4dCA9IHNlbGYuX2dldFRleHRDb250ZW50KGVOb2RlcywgdFNlbGVjdG9yLCBiclNlbGVjdG9yKTtcblx0XHRcdFx0aWYgKGVOb2Rlc1RleHQpIHtcblx0XHRcdFx0XHRmb290bm90ZXMgPSBbZm9vdG5vdGVzLCBlTm9kZXNUZXh0XS5qb2luKCcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRpZiAoZm9vdG5vdGVzICYmIGZvb3Rub3Rlcy5sZW5ndGgpIHtcblx0XHRcdFx0ZG9jdW1lbnQgPSBbZG9jdW1lbnQsICdGT09UTk9URVMnLCBmb290bm90ZXNdLmpvaW4oJ1xcbicpOyBcblx0XHRcdH1cblx0XHR9XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XG5cdH1cblx0XG5cdHJldHVybiBkb2N1bWVudDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgY29udGVudHMgb2YgdGhlIE9EVCBmaWxlIGFzIGEgc3RyaW5nLlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtICAge09iamVjdH0gZmlsZUNvbnRlbnRzIC0gdGhlIGNvbnRlbnRzIG9mIHRoZSBmaWxlIG9iamVjdFxuICogQHJldHVybnMge1N0cmluZ30gICAgICAgICAgICAgIC0gdGhlIHRleHQgb2YgdGhlIE9EVCBmaWxlXG4gKi9cbkZpbGVJbnB1dFJlYWRlci5wcm90b3R5cGUuX3JlYWRPRFQgPSBmdW5jdGlvbihmaWxlQ29udGVudHMpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0ZG9jdW1lbnQsIFxuXHRcdFx0dFNlbGVjdG9yICA9ICcjdGV4dCcsIFxuXHRcdFx0YnJTZWxlY3RvciA9ICd0ZXh0OmxpbmUtYnJlYWsnLFxuXHRcdFx0emlwO1xuXHRcblx0Ly8gVW56aXAgdGhlIGZpbGVcblx0dHJ5IHtcblx0XHR6aXAgPSBuZXcgSlNaaXAoZmlsZUNvbnRlbnRzKTtcblxuXHRcdC8vIFJlYWQgdGhlIG1haW4gdGV4dCwgYXMgd2VsbCBhcyB0aGUgZm9vdG5vdGVzL2VuZG5vdGVzIG9mIHRoZSBPRFQgZmlsZVxuXHRcdHZhciBmaWxlID0gemlwLmZpbGVzWydjb250ZW50LnhtbCddO1xuXHRcdFxuXHRcdGlmIChmaWxlKSB7XG5cdFx0XHR2YXIgeG1sRG9jID0gJC5wYXJzZVhNTChmaWxlLmFzVGV4dCgpKTtcblx0XHRcdHZhciBwTm9kZXMgPSAkKHhtbERvYykuZmluZCgnb2ZmaWNlXFxcXDpib2R5LCBib2R5JykuY2hpbGRyZW4oKTtcblx0XHRcdGRvY3VtZW50ID0gc2VsZi5fZ2V0VGV4dENvbnRlbnQocE5vZGVzLCB0U2VsZWN0b3IsIGJyU2VsZWN0b3IpO1xuXHRcdFx0XG5cdFx0XHRpZiAoIXNlbGYuaWdub3JlRm9vdG5vdGVzKSB7XG5cdFx0XHRcdHZhciBmTm9kZXMgPSAkKHBOb2RlcykuZmluZCgndGV4dFxcXFw6bm90ZS1ib2R5LCBub3RlLWJvZHknKTtcblx0XHRcdFx0dmFyIGZvb3Rub3RlcyA9IHNlbGYuX2dldFRleHRDb250ZW50KGZOb2RlcywgdFNlbGVjdG9yLCBiclNlbGVjdG9yKTtcblx0XHRcdFx0XG5cdFx0XHRcdGlmIChmb290bm90ZXMgJiYgZm9vdG5vdGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGRvY3VtZW50ID0gW2RvY3VtZW50LCAnRk9PVE5PVEVTJywgZm9vdG5vdGVzXS5qb2luKCdcXG4nKTsgXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XG5cdH1cblx0XG5cdHJldHVybiBkb2N1bWVudDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmlsZUlucHV0UmVhZGVyO1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgJCAgICAgICA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcbnZhciBYUmVnRXhwID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ1hSZWdFeHAnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1hSZWdFeHAnXSA6IG51bGwpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7VGV4dElucHV0UmVhZGVyfSxcbiAqIHdoaWNoIHBhcnNlcyBhbmQgZXh0cmFjdHMgdGhlIHRleHQgY29udGVudHMgb2YgdGhlIEhUTUwgdGV4dCBpbnB1dC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQHRoaXMge1RleHRJbnB1dFJlYWRlcn1cbiAqL1xuZnVuY3Rpb24gVGV4dElucHV0UmVhZGVyKCkge1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFuZGxlcyB0aGUgSFRNTCBpbnB1dCByZWFkaW5nLlxuICogV2hlbiByZXNvbHZlZCwgdGhlIGNvbnRlbnRzIG9mIHRoZSBIVE1MIHRleHRcbiAqIGFyZSByZXR1cm5lZCBhcyBhIHN0cmluZy4gXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSAgIHtTdHJpbmd9IHRleHQgLSB0aGUgSFRNTCB0ZXh0IGlucHV0XG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqL1xuVGV4dElucHV0UmVhZGVyLnByb3RvdHlwZS5yZWFkVGV4dElucHV0ID0gZnVuY3Rpb24odGV4dCkge1xuXHR2YXIgc2VsZiAgICAgPSB0aGlzLFxuXHRcdFx0ZGVmZXJyZWQgPSAkLkRlZmVycmVkKCk7XG5cdFx0XG5cdHZhciBjbGVhbmVkVGV4dCA9ICcnO1xuXHR2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGRpdi5pbm5lckhUTUwgPSB0ZXh0O1xuXG5cdHZhciB0ZXh0Tm9kZSA9IHNlbGYuX2V4dHJhY3RUZXh0RnJvbU5vZGUoZGl2KTtcblx0Ly8gSWYgaXMgbm90IGVtcHR5IG9yIG5vdCBjb250YWlucyBvbmx5IHdoaXRlIHNwYWNlc1xuXHRpZiAodGV4dE5vZGUubGVuZ3RoICYmIC9cXFMvLnRlc3QodGV4dE5vZGUpKSB7XG5cdFx0Y2xlYW5lZFRleHQgPSBbY2xlYW5lZFRleHQsIHRleHROb2RlXS5qb2luKCcnKTtcblx0XHQvLyBSZW1vdmUgbXVsdGlwbGUgd2hpdGUgc3BhY2VzXG5cdFx0Y2xlYW5lZFRleHQgPSBjbGVhbmVkVGV4dC5yZXBsYWNlKC9cXG5bIFxcdFxcdl0qL2csICdcXG4nKTtcblx0XHQvLyBSZW1vdmUgbXVsdGlwbGUgbmV3bGluZXNcblx0XHRjbGVhbmVkVGV4dCA9IGNsZWFuZWRUZXh0LnJlcGxhY2UoL1xcbnszLH0vZywgJ1xcblxcbicpO1xuXHRcdFxuXHRcdC8vIFJlc29sdmVcblx0XHRkZWZlcnJlZC5yZXNvbHZlKGNsZWFuZWRUZXh0KTtcblx0fSBlbHNlIHtcblx0XHQvLyBSZWplY3Rcblx0XHRkZWZlcnJlZC5yZWplY3QoJ0hUTUwgaW5wdXQgaGFzIG5vIHZhbGlkIHRleHQgY29udGVudHMuJyk7XG5cdH1cblx0XHRcblx0cmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbn07XG5cbi8qKlxuICogVHJhdmVyc2VzIHJlY3Vyc2l2ZWx5IGFsbCBjaGlsZCBub2RlcywgXG4gKiBpcnJlc3BlY3RpdmUgb2YgaG93IGRlZXAgdGhlIG5lc3RpbmcgaXMuXG4gKiBSZXR1cm5zIHRoZSBIVE1MIHRleHQgY29udGVudHMgYXMgYSBzdHJpbmcuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0gICB7T2JqZWN0fSBub2RlIC0gdGhlIHBhcmVudCBIVE1MIG5vZGUgZWxlbWVudFxuICogQHJldHVybnMge1N0cmluZ30gICAgICAtIHRoZSB0ZXh0IGNvbnRlbnQgb2YgdGhlIEhUTUwgc3RyaW5nXG4gKi9cblRleHRJbnB1dFJlYWRlci5wcm90b3R5cGUuX2V4dHJhY3RUZXh0RnJvbU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdC8vIE1hdGNoIGFueSBsZXR0ZXJcblx0XHRcdGxldHRlclJlZ2V4ID0gWFJlZ0V4cCgnXlxcXFxwTCskJyksXG5cdFx0XHRzdHIgPSAnJztcblx0XG5cdC8vIFJldHVybnMgd2hldGhlciBhIG5vZGUgc2hvdWxkIGJlIHNraXBwZWRcblx0dmFyIGlzVmFsaWROb2RlID0gZnVuY3Rpb24obm9kZU5hbWUpIHtcblx0XHR2YXIgc2tpcE5vZGVzICAgICAgID0gWydJRlJBTUUnLCAnTk9TQ1JJUFQnLCAnU0NSSVBUJywgJ1NUWUxFJ10sXG5cdFx0XHRcdHNraXBOb2Rlc0xlbmd0aCA9IHNraXBOb2Rlcy5sZW5ndGg7XG5cdFx0XHRcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHNraXBOb2Rlc0xlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAobm9kZU5hbWUgPT09IHNraXBOb2Rlc1tpXSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlOyBcblx0fTtcblx0XG5cdGlmIChpc1ZhbGlkTm9kZShub2RlLm5vZGVOYW1lKSAmJiBub2RlLmhhc0NoaWxkTm9kZXMoKSkge1xuXHRcdHZhciBjaGlsZCA9IG5vZGUuZmlyc3RDaGlsZDtcblx0XHRcblx0XHR3aGlsZSAoY2hpbGQpIHtcblx0XHRcdC8vIElmIHRleHQgbm9kZVxuXHRcdFx0aWYgKGNoaWxkLm5vZGVUeXBlID09PSAzKSB7XG5cdFx0XHRcdHZhciBjb250ZW50ID0gY2hpbGQudGV4dENvbnRlbnQ7XG5cdFx0XHRcdGlmIChjb250ZW50Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHN0ciArPSBjb250ZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgZXh0cmFjdGVkQ29udGVudCA9IHNlbGYuX2V4dHJhY3RUZXh0RnJvbU5vZGUoY2hpbGQpO1xuXHRcdFx0XHQvLyBBZGQgYSBzcGFjZSBiZXR3ZWVuIHRleHQgbm9kZXMgdGhhdCBhcmUgbm90IHNlcGFyYXRlZCBcblx0XHRcdFx0Ly8gYnkgYSBzcGFjZSBvciBuZXdsaW5lIChlLmcuIGFzIGluIGxpc3RzKVxuXHRcdFx0XHRpZiAobGV0dGVyUmVnZXgudGVzdChzdHJbc3RyLmxlbmd0aCAtIDFdKSAmJiBsZXR0ZXJSZWdleC50ZXN0KGV4dHJhY3RlZENvbnRlbnRbMF0pKSB7XG5cdFx0XHRcdFx0c3RyICs9ICcgJztcblx0XHRcdFx0fVxuXHRcdFx0XHRzdHIgKz0gZXh0cmFjdGVkQ29udGVudDtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Y2hpbGQgPSBjaGlsZC5uZXh0U2libGluZztcblx0XHR9XG5cdH1cblx0XG5cdHJldHVybiBzdHI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRleHRJbnB1dFJlYWRlcjtcbiIsIi8qIGpzaGludCB1bmRlZjp0cnVlLCB1bnVzZWQ6dHJ1ZSwgbm9kZTp0cnVlLCBicm93c2VyOnRydWUgKi9cbid1c2Ugc3RyaWN0JztcblxudmFyICQgICA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WyckJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyckJ10gOiBudWxsKTtcbnZhciBBcHAgPSByZXF1aXJlKCcuL2FwcC9hcHAuanMnKTtcblxuLy8gTWFpbiBleGVjdXRpb24gZW50cnkgcG9pbnRcbiQod2luZG93KS5sb2FkKGZ1bmN0aW9uKCkge1xuXHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdCQoXCIubG9hZGVyXCIpLmFkZENsYXNzKCdzaHJpbmtlZCcpO1xuXHRcdHZhciBhcHAgPSBuZXcgQXBwKCdzaW10ZXh0ZXInKTtcblx0fSwgNzAwKTtcbn0pO1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFJlY29yZHMgYSBtYXRjaCBmb3VuZCBpbiB0aGUgc291cmNlIGFuZCB0aGUgdGFyZ2V0IHRleHQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEB0aGlzICB7TWF0Y2h9XG4gKiBAcGFyYW0ge051bWJlcn0gc3JjVHh0SWR4ICAgICAtIHRoZSBpbmRleCBvZiB0aGUgc291cmNlIHRleHQgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpbiB7U2ltVGV4dGVyLnRleHRzW119LCB3aGVyZSB0aGUgbWF0Y2ggXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpcyBmb3VuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHNyY1RrQmVnaW5Qb3MgLSB0aGUgaW5kZXggb2YgdGhlIHNvdXJjZSB0ZXh0J3MgdG9rZW4gXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpbiB7U2ltVGV4dGVyLnRva2Vuc1tdfSwgd2hlcmUgdGhlIG1hdGNoIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgc3RhcnRzIFxuICogQHBhcmFtIHtOdW1iZXJ9IHRyZ1R4dElkeCAgICAgLSB0aGUgaW5kZXggb2YgdGhlIHRhcmdldCB0ZXh0XG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpbiB7U2ltVGV4dGVyLnRleHRzW119LCB3aGVyZSB0aGUgbWF0Y2ggXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpcyBmb3VuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHRyZ1RrQmVnaW5Qb3MgLSB0aGUgaW5kZXggb2YgdGhlIHRhcmdldCB0ZXh0J3MgdG9rZW4gXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBpbiB7U2ltVGV4dGVyLnRva2Vuc1tdfSwgd2hlcmUgdGhlIG1hdGNoIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgc3RhcnRzXG4gKiBAcGFyYW0ge051bWJlcn0gbWF0Y2hMZW5ndGggICAtIHRoZSBsZW5ndGggb2YgdGhlIG1hdGNoIFxuICovXG5mdW5jdGlvbiBNYXRjaChzcmNUeHRJZHgsIHNyY1RrQmVnaW5Qb3MsIHRyZ1R4dElkeCwgdHJnVGtCZWdpblBvcywgbWF0Y2hMZW5ndGgpIHtcblx0dGhpcy5zcmNUeHRJZHggICAgID0gc3JjVHh0SWR4O1xuXHR0aGlzLnNyY1RrQmVnaW5Qb3MgPSBzcmNUa0JlZ2luUG9zO1xuXHR0aGlzLnRyZ1R4dElkeCAgICAgPSB0cmdUeHRJZHg7XG5cdHRoaXMudHJnVGtCZWdpblBvcyA9IHRyZ1RrQmVnaW5Qb3M7XG5cdHRoaXMubWF0Y2hMZW5ndGggICA9IG1hdGNoTGVuZ3RoO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE1hdGNoO1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFJlY29yZHMgYSBtYXRjaCBmb3VuZCBpbiBhIHRleHQuXG4gKiBAY29uc3RydWN0b3JcbiAqIEB0aGlzICB7TWF0Y2hTZWdtZW50fVxuICogQHBhcmFtIHtOdW1iZXJ9IHR4dElkeCAgICAgIC0gdGhlIGluZGV4IG9mIHRoZSB0ZXh0IGluIHtTaW1UZXh0ZXIudGV4dHNbXX0sXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgd2hlcmUgdGhlIG1hdGNoIGhhcyBiZWVuIGZvdW5kXG4gKiBAcGFyYW0ge051bWJlcn0gdGtCZWdpblBvcyAgLSB0aGUgaW5kZXggb2YgdGhlIHRva2VuIGluIHtTaW1UZXh0ZXIudG9rZW5zW119LFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IHdoZXJlIHRoZSBtYXRjaCBzdGFydHMgXG4gKiBAcGFyYW0ge051bWJlcn0gbWF0Y2hMZW5ndGggLSB0aGUgbGVuZ3RoIG9mIHRoZSBtYXRjaFxuICovXG5mdW5jdGlvbiBNYXRjaFNlZ21lbnQodHh0SWR4LCB0a0JlZ2luUG9zLCBtYXRjaExlbmd0aCkge1xuXHR0aGlzLnR4dElkeCAgICAgID0gdHh0SWR4O1xuXHR0aGlzLnRrQmVnaW5Qb3MgID0gdGtCZWdpblBvcztcblx0dGhpcy5tYXRjaExlbmd0aCA9IG1hdGNoTGVuZ3RoO1xuXHR0aGlzLnN0eWxlQ2xhc3MgID0gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIG1hdGNoJ3MgbGluayBub2RlLlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0ge1N0cmluZ30gICAgICAgdGV4dCAgICAgICAgICAgIC0gdGhlIHRleHQgY29udGVudCBvZiB0aGUgbm9kZSBcbiAqIEBwYXJhbSB7TWF0Y2hTZWdtZW50fSB0cmdNYXRjaFNlZ21lbnQgLSB0aGUgdGFyZ2V0IG1hdGNoIHNlZ21lbnRcbiAqIEByZXR1cm5zICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLSB0aGUgbWF0Y2gncyBsaW5rIG5vZGVcbiAqL1xuTWF0Y2hTZWdtZW50LnByb3RvdHlwZS5jcmVhdGVMaW5rTm9kZSA9IGZ1bmN0aW9uKHRleHQsIHRyZ01hdGNoU2VnbWVudCkge1xuXHR2YXIgc2VsZiA9IHRoaXMsXG4gICAgXHRtYXRjaExpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgXHRcbiAgICBtYXRjaExpbmsuaWQgICAgICAgICAgPSBbc2VsZi50eHRJZHggKyAxLCAnLScsIHNlbGYudGtCZWdpblBvc10uam9pbignJyk7XG4gICAgbWF0Y2hMaW5rLmNsYXNzTmFtZSAgID0gc2VsZi5zdHlsZUNsYXNzO1xuICAgIG1hdGNoTGluay5ocmVmICAgICAgICA9IFsnIycsIHRyZ01hdGNoU2VnbWVudC50eHRJZHgrMSwgJy0nLCB0cmdNYXRjaFNlZ21lbnQudGtCZWdpblBvc10uam9pbignJyk7XG4gICAgbWF0Y2hMaW5rLnRleHRDb250ZW50ID0gdGV4dDtcbiAgICByZXR1cm4gbWF0Y2hMaW5rO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgdG9rZW4gaW4ge1NpbVRleHRlci50b2tlbnNbXX0sXG4gKiB3aGVyZSB0aGUgbWF0Y2ggZW5kcy5cbiAqIEBmdW5jdGlvblxuICogQHJldHVybnMge051bWJlcn0gLSB0aGUgbGFzdCB0b2tlbiBwb3NpdGlvbiBvZiB0aGUgbWF0Y2ggKG5vbi1pbmNsdXNpdmUpXG4gKi9cbk1hdGNoU2VnbWVudC5wcm90b3R5cGUuZ2V0VGtFbmRQb3NpdGlvbiA9IGZ1bmN0aW9uKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHJldHVybiBzZWxmLnRrQmVnaW5Qb3MgKyBzZWxmLm1hdGNoTGVuZ3RoO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgY2hhcmFjdGVyIGluIHRoZSBpbnB1dCBzdHJpbmcsXG4gKiB3aGVyZSB0aGUgbWF0Y2ggc3RhcnRzLlxuICogQGZ1bmN0aW9uXG4gKiBAcmV0dXJucyB7TnVtYmVyfSAtIHRoZSBmaXJzdCBjaGFyYWN0ZXIgb2YgdGhlIG1hdGNoIGluIHRoZSBpbnB1dCBzdHJpbmcgXG4gKi9cbk1hdGNoU2VnbWVudC5wcm90b3R5cGUuZ2V0VHh0QmVnaW5Qb3MgPSBmdW5jdGlvbih0b2tlbnMpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0b2tlbnNbc2VsZi50a0JlZ2luUG9zXS50eHRCZWdpblBvcztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGNoYXJhY3RlciBpbiB0aGUgaW5wdXQgc3RyaW5nLFxuICogd2hlcmUgdGhlIG1hdGNoIGVuZHMuXG4gKiBAZnVuY3Rpb25cbiAqIEByZXR1cm5zIHtOdW1iZXJ9IC0gdGhlIGxhc3QgY2hhcmFjdGVyIG9mIHRoZSBtYXRjaCBpbiB0aGUgaW5wdXQgc3RyaW5nIFxuICovXG5NYXRjaFNlZ21lbnQucHJvdG90eXBlLmdldFR4dEVuZFBvcyA9IGZ1bmN0aW9uKHRva2Vucykge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRva2Vuc1tzZWxmLnRrQmVnaW5Qb3MgKyBzZWxmLm1hdGNoTGVuZ3RoIC0gMV0udHh0RW5kUG9zO1xufTtcblxuLyoqXG4gKiBTZXRzIHRoZSBzdHlsZSBjbGFzcyBvZiB0aGUgbWF0Y2ggc2VnbWVudC5cbiAqIEBmdW5jdGlvblxuICogQHBhcmFtIHsoTnVtYmVyfFN0cmluZyl9IG4gLSB0aGUgc3R5bGUgY2xhc3MgdG8gYmUgYXBwbGllZFxuICovXG5NYXRjaFNlZ21lbnQucHJvdG90eXBlLnNldFN0eWxlQ2xhc3MgPSBmdW5jdGlvbihuKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0aWYgKHR5cGVvZiBuID09PSAnbnVtYmVyJykge1xuXHRcdHNlbGYuc3R5bGVDbGFzcyA9IFsnaGwtJywgbiAlIDEwXS5qb2luKCcnKTtcblx0fVxuXHRcblx0aWYgKHR5cGVvZiBuID09PSAnc3RyaW5nJykge1xuXHRcdHNlbGYuc3R5bGVDbGFzcyA9IG47XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTWF0Y2hTZWdtZW50O1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgJCAgICAgICAgICAgID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJyQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJyQnXSA6IG51bGwpO1xudmFyIFhSZWdFeHAgICAgICA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydYUmVnRXhwJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydYUmVnRXhwJ10gOiBudWxsKTtcbnZhciBNYXRjaCAgICAgICAgPSByZXF1aXJlKCcuL21hdGNoLmpzJyk7XG52YXIgTWF0Y2hTZWdtZW50ID0gcmVxdWlyZSgnLi9tYXRjaFNlZ21lbnQuanMnKTtcbnZhciBUZXh0ICAgICAgICAgPSByZXF1aXJlKCcuL3RleHQuanMnKTtcbnZhciBUb2tlbiAgICAgICAgPSByZXF1aXJlKCcuL3Rva2VuLmpzJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBpbnN0YW5jZSBvZiB7U2ltVGV4dGVyfS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHt0aGlzfSAgICAgICAgU2ltVGV4dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gICAgICBzdG9yYWdlICAgLSB0aGUgb2JqZWN0IHRoYXQgaG9sZHMgdGhlIGFwcCdzIHNldHRpbmdzXG4gKi9cbmZ1bmN0aW9uIFNpbVRleHRlcihzdG9yYWdlKSB7XG5cdHRoaXMuaWdub3JlTGV0dGVyQ2FzZSAgPSBzdG9yYWdlLmdldEl0ZW1WYWx1ZUJ5S2V5KCdpZ25vcmVMZXR0ZXJDYXNlJyk7XG5cdHRoaXMuaWdub3JlTnVtYmVycyAgICAgPSBzdG9yYWdlLmdldEl0ZW1WYWx1ZUJ5S2V5KCdpZ25vcmVOdW1iZXJzJyk7XG5cdHRoaXMuaWdub3JlUHVuY3R1YXRpb24gPSBzdG9yYWdlLmdldEl0ZW1WYWx1ZUJ5S2V5KCdpZ25vcmVQdW5jdHVhdGlvbicpO1xuXHR0aGlzLnJlcGxhY2VVbWxhdXQgICAgID0gc3RvcmFnZS5nZXRJdGVtVmFsdWVCeUtleSgncmVwbGFjZVVtbGF1dCcpO1xuXHR0aGlzLm1pbk1hdGNoTGVuZ3RoICAgID0gc3RvcmFnZS5nZXRJdGVtVmFsdWVCeUtleSgnbWluTWF0Y2hMZW5ndGgnKTtcblx0XG5cdHRoaXMudGV4dHMgICAgICAgICAgICAgPSBbXTtcblx0dGhpcy50b2tlbnMgICAgICAgICAgICA9IFtuZXcgVG9rZW4oKV07XG5cdHRoaXMudW5pcXVlTWF0Y2hlcyAgICAgPSAwO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFuZGxlcyB0aGUgY29tcGFyaXNvbiBwcm9jZXNzLlxuICogV2hlbiByZXNvbHZlZCwgYW4gYXJyYXkgb2Ygbm9kZXMgaXMgcmV0dXJuZWQsXG4gKiB3aGljaCBob2xkcyB0aGUgdGV4dCBhbmQgdGhlIGhpZ2hsaWdodGVkIG1hdGNoZXMuXG4gKiBAZnVuY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXk8SW5wdXRUZXh0Pn0gaW5wdXRUZXh0cyAtIHRoZSBhcnJheSBvZiB7SW5wdXRUZXh0fSBvYmplY3RzIFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpY2ggaG9sZCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgdXNlciBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IFx0XHRcdFx0aW5wdXRcbiAqL1xuU2ltVGV4dGVyLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24oaW5wdXRUZXh0cykge1xuXHR2YXIgc2VsZiAgICAgPSB0aGlzLFxuXHRcdFx0ZGVmZXJyZWQgPSAkLkRlZmVycmVkKCksXG5cdFx0XHRmb3J3YXJkUmVmZXJlbmNlcyA9IFtdLFxuXHRcdFx0c2ltaWxhcml0aWVzID0gW107XG5cdFxuXHRcdC8vIFJlYWQgaW5wdXQgKGkuZS4gY2xlYW5pbmcsIHRva2VuaXphdGlvbilcblx0XHRzZWxmLl9yZWFkSW5wdXQoaW5wdXRUZXh0cywgZm9yd2FyZFJlZmVyZW5jZXMpO1xuXHRcdC8vIEdldCBtYXRjaGVzXG5cdFx0c2ltaWxhcml0aWVzID0gc2VsZi5fZ2V0U2ltaWxhcml0aWVzKDAsIDEsIGZvcndhcmRSZWZlcmVuY2VzKTtcblxuXHRcdGlmIChzaW1pbGFyaXRpZXMubGVuZ3RoKSB7XG5cdFx0XHQvLyBSZXR1cm4gaW5wdXQgc3RyaW5nIGFzIEhUTUwgbm9kZXNcblx0XHRcdGRlZmVycmVkLnJlc29sdmUoc2VsZi5fZ2V0Tm9kZXMoaW5wdXRUZXh0cywgc2ltaWxhcml0aWVzKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlZmVycmVkLnJlamVjdCgnTm8gc2ltaWxhcml0aWVzIGZvdW5kLicpO1xuXHRcdH1cblx0XG5cdHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG59O1xuXG4vKipcbiAqIEFwcGxpZXMgYSBzdHlsZSBjbGFzcyB0byBlYWNoIG1hdGNoIHNlZ21lbnRcbiAqIGFuZCByZW1vdmVzIGR1cGxpY2F0ZXMgZnJvbSB0aGUgYXJyYXkgb2YgbWF0Y2hlcy5cbiAqIER1cGxpY2F0ZXMgb3Igb3ZlcmxhcHBpbmcgc2VnbWVudHMgY2FuIGJlIHRyYWNlZCxcbiAqIGlmIG9uZSBvYnNlcnZlcyB0aGUgdGFyZ2V0IHtNYXRjaFNlZ21lbnR9IG9iamVjdHMgXG4gKiBzdG9yZWQgaW4gdGhlIGFycmF5IG1hdGNoZXMuXG4gKiBTb3J0aW5nIG9mIG1hdGNoZXMgYnkgdGFyZ2V0IHtNYXRjaFNlZ21lbnR9LCBcbiAqIHdpdGggaXRzIHRrQmVnaW5Qb3MgaW4gYXNjZW5kaW5nIG9yZGVyIFxuICogYW5kIGl0cyBtYXRjaExlbmd0aCBpbiBkZXNjZW5kaW5nIG9yZGVyLFxuICogbWFrZXMgcmVtb3ZhbCBvZiBkdXBsaWNhdGVzIGVhc3kgdG8gaGFuZGxlLlxuICogVGhlIGZpcnN0IHtNYXRjaFNlZ21lbnR9IHdpdGggYSBnaXZlbiB0a0JlZ2luUG9zXG4gKiBoYXMgdGhlIGxvbmdlc3QgbGVuZ3RoLiBBbGwgb3RoZXJzIHdpdGggdGhlIHNhbWUgdGtCZWdpblBvc1xuICogaGF2ZSB0aGUgc2FtZSBvciBhIHNtYWxsZXIgbGVuZ3RoLCBhbmQgdGh1cyBjYW4gYmUgZGlzY2FyZGVkLlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtICAge0FycmF5fSBtYXRjaGVzIC0gdGhlIGFycmF5IHRoYXQgaG9sZHMgdGhlIG1hdGNoIHNlZ21lbnRzLCBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRzdG9yZWQgaW4gcGFpcnNcbiAqIEByZXR1cm5zIHtBcnJheX0gICAgICAgICAtIHRoZSBhcnJheSBvZiB1bmlxdWUgbWF0Y2hlc1xuICovXG5TaW1UZXh0ZXIucHJvdG90eXBlLl9hcHBseVN0eWxlcyA9IGZ1bmN0aW9uKG1hdGNoZXMpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcblx0Ly8gU29ydCBtYXRjaGVzIGJ5IHRhcmdldCB7TWF0Y2hTZWdtZW50fSxcblx0Ly8gd2hlcmUgdGtCZWdpblBvcyBpbiBhc2NlbmRpbmcgb3JkZXIgYW5kIG1hdGNoTGVuZ3RoIGluIGRlc2NlbmRpbmcgb3JkZXJcblx0dmFyIHNvcnRlZE1hdGNoZXMgPSBzZWxmLl9zb3J0U2ltaWxhcml0aWVzKG1hdGNoZXMsIDEpO1xuXHR2YXIgc29ydGVkTWF0Y2hlc0xlbmd0aCA9IHNvcnRlZE1hdGNoZXMubGVuZ3RoO1xuXHR2YXIgc3R5bGVDbGFzc0NudCA9IDE7XG5cdFxuXHQvLyBBZGQgZmlyc3QgbWF0Y2ggaW4gYXJyYXkgb2YgdW5pcXVlIG1hdGNoZXMgdG8gaGF2ZSBhIHN0YXJ0aW5nIHBvaW50XG5cdHZhciB1bmlxdWVNYXRjaCA9IFtzb3J0ZWRNYXRjaGVzWzBdWzBdLCBzb3J0ZWRNYXRjaGVzWzBdWzFdXTtcblx0dW5pcXVlTWF0Y2hbMF0uc2V0U3R5bGVDbGFzcygwKTtcblx0dW5pcXVlTWF0Y2hbMV0uc2V0U3R5bGVDbGFzcygwKTtcblx0dmFyIGFVbmlxdWVNYXRjaGVzID0gW3VuaXF1ZU1hdGNoXTtcblxuXHQvLyBGb3IgZWFjaCBtYXRjaCBpbiBzb3J0ZWRNYXRjaGVzW11cblx0Zm9yICh2YXIgaSA9IDE7IGkgPCBzb3J0ZWRNYXRjaGVzTGVuZ3RoOyBpKyspIHtcblx0XHR2YXIgbGFzdFVuaXF1ZU1hdGNoID0gYVVuaXF1ZU1hdGNoZXNbYVVuaXF1ZU1hdGNoZXMubGVuZ3RoIC0gMV1bMV07XG5cdFx0dmFyIG1hdGNoID0gc29ydGVkTWF0Y2hlc1tpXVsxXTtcblx0XHRcblx0XHQvLyBJZiBub3QgZHVwbGljYXRlXG5cdFx0aWYgKGxhc3RVbmlxdWVNYXRjaC50a0JlZ2luUG9zICE9IG1hdGNoLnRrQmVnaW5Qb3MpIHtcblx0XHRcdC8vIGlmIG5vdCBvdmVybGFwcGluZ1xuXHRcdFx0aWYgKGxhc3RVbmlxdWVNYXRjaC5nZXRUa0VuZFBvc2l0aW9uKCkgLSAxIDwgbWF0Y2gudGtCZWdpblBvcykge1xuXHRcdFx0XHR1bmlxdWVNYXRjaCA9IFtzb3J0ZWRNYXRjaGVzW2ldWzBdLCBzb3J0ZWRNYXRjaGVzW2ldWzFdXTtcblx0XHRcdFx0dW5pcXVlTWF0Y2hbMF0uc2V0U3R5bGVDbGFzcyhzdHlsZUNsYXNzQ250KTtcblx0XHRcdFx0dW5pcXVlTWF0Y2hbMV0uc2V0U3R5bGVDbGFzcyhzdHlsZUNsYXNzQ250KTtcblx0XHRcdFx0YVVuaXF1ZU1hdGNoZXMucHVzaCh1bmlxdWVNYXRjaCk7XG5cdFx0XHRcdHN0eWxlQ2xhc3NDbnQrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGVuZC10by1zdGFydCBvdmVybGFwcGluZ1xuXHRcdFx0XHQvLyBlbmQgb2YgbGFzdFVuaXF1ZU1hdGNoIG92ZXJsYXBzIHdpdGggc3RhcnQgb2YgbWF0Y2hcblx0XHRcdFx0aWYgKGxhc3RVbmlxdWVNYXRjaC5nZXRUa0VuZFBvc2l0aW9uKCkgPCBtYXRjaC5nZXRUa0VuZFBvc2l0aW9uKCkpIHtcblx0XHRcdFx0XHR2YXIgc3R5bGVDbGFzcyA9ICggL292ZXJsYXBwaW5nJC8udGVzdChsYXN0VW5pcXVlTWF0Y2guc3R5bGVDbGFzcykgKSA/IGxhc3RVbmlxdWVNYXRjaC5zdHlsZUNsYXNzIDogbGFzdFVuaXF1ZU1hdGNoLnN0eWxlQ2xhc3MgKyAnIG92ZXJsYXBwaW5nJztcblx0XHRcdFx0XHQvLyBPdmVyd3JpdGUgdGhlIHN0eWxlIG9mIHRoZSBsYXN0IHVuaXF1ZSBtYXRjaCBzZWdtZW50IFxuXHRcdFx0XHRcdC8vIGFuZCBjaGFuZ2UgaXRzIGxlbmd0aCBhY2NvcmRpbmdseVxuXHRcdFx0XHRcdGFVbmlxdWVNYXRjaGVzW2FVbmlxdWVNYXRjaGVzLmxlbmd0aCAtIDFdWzBdLnNldFN0eWxlQ2xhc3Moc3R5bGVDbGFzcyk7XG5cdFx0XHRcdFx0YVVuaXF1ZU1hdGNoZXNbYVVuaXF1ZU1hdGNoZXMubGVuZ3RoIC0gMV1bMV0uc2V0U3R5bGVDbGFzcyhzdHlsZUNsYXNzKTtcblx0XHRcdFx0XHRhVW5pcXVlTWF0Y2hlc1thVW5pcXVlTWF0Y2hlcy5sZW5ndGggLSAxXVsxXS5tYXRjaExlbmd0aCA9IG1hdGNoLnRrQmVnaW5Qb3MgLSBsYXN0VW5pcXVlTWF0Y2gudGtCZWdpblBvcztcblx0XHRcdFx0XHRcblx0XHRcdFx0XHQvLyBBZGQgdGhlIG5ldyBtYXRjaCBzZWdtZW50XG5cdFx0XHRcdFx0dW5pcXVlTWF0Y2ggPSBbc29ydGVkTWF0Y2hlc1tpXVswXSwgc29ydGVkTWF0Y2hlc1tpXVsxXV07XG5cdFx0XHRcdFx0dW5pcXVlTWF0Y2hbMF0uc2V0U3R5bGVDbGFzcyhzdHlsZUNsYXNzKTtcblx0XHRcdFx0XHR1bmlxdWVNYXRjaFsxXS5zZXRTdHlsZUNsYXNzKHN0eWxlQ2xhc3MpO1xuXHRcdFx0XHRcdGFVbmlxdWVNYXRjaGVzLnB1c2godW5pcXVlTWF0Y2gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBcblx0fVxuXG5cdHNlbGYudW5pcXVlTWF0Y2hlcyA9IGFVbmlxdWVNYXRjaGVzLmxlbmd0aDtcblx0cmV0dXJuIGFVbmlxdWVNYXRjaGVzO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgcmVndWxhciBleHByZXNzaW9uIGRlcGVuZGluZyBvbiB0aGUgY29tcGFyaXNvbiBvcHRpb25zIHNldC5cbiAqIFVzZXMgdGhlIFhSZWdFeHAgY2F0ZWdvcnkgcGF0dGVybnMuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcmV0dXJucyB7WFJlZ0V4cH0gLSB0aGUgcmVndWxhciBleHByZXNzaW9uXG4gKi9cblNpbVRleHRlci5wcm90b3R5cGUuX2J1aWxkUmVnZXggPSBmdW5jdGlvbigpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0Ly8gWFJlZ0V4cCBwYXR0ZXJuc1xuXHRcdFx0TlVNQkVSUyAgICAgPSAnXFxcXHB7Tn0nLFxuXHRcdFx0UFVOQ1RVQVRJT04gPSAnXFxcXHB7UH0nLFx0XHRcblx0XHRcdHJlZ2V4ICAgICAgID0gJyc7XG5cdFxuXHRpZiAoc2VsZi5pZ25vcmVOdW1iZXJzKSB7XG5cdFx0cmVnZXggKz0gTlVNQkVSUztcblx0fVxuXHRcblx0aWYgKHNlbGYuaWdub3JlUHVuY3R1YXRpb24pIHtcblx0XHRyZWdleCArPSBQVU5DVFVBVElPTjtcblx0fVxuXHRcdFxuXHRyZXR1cm4gKHJlZ2V4Lmxlbmd0aCA+IDApID8gWFJlZ0V4cCgnWycgKyByZWdleCArICddJywgJ2cnKSA6IHVuZGVmaW5lZDtcbn07XG5cbi8qKlxuICogQ2xlYW5zIHRoZSBpbnB1dCBzdHJpbmcgYWNjb3JkaW5nIHRvIHRoZSBjb21wYXJpc29uIG9wdGlvbnMgc2V0LlxuICogQGZ1bmN0aW9uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtICAge1N0cmluZ30gaW5wdXRUZXh0IC0gdGhlIGlucHV0IHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gICAgICAgICAgIC0gdGhlIGNsZWFuZWQgaW5wdXQgc3RyaW5nXG4gKi9cblNpbVRleHRlci5wcm90b3R5cGUuX2NsZWFuSW5wdXRUZXh0ID0gZnVuY3Rpb24oaW5wdXRUZXh0KSB7XG5cdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdHRleHQgPSBpbnB1dFRleHQ7XG5cdFx0XHRcblx0dmFyIGxhbmdSZWdleCA9IHNlbGYuX2J1aWxkUmVnZXgoKTtcblx0XG5cdGlmIChsYW5nUmVnZXgpIHtcblx0XHR0ZXh0ID0gaW5wdXRUZXh0LnJlcGxhY2UobGFuZ1JlZ2V4LCAnICcpO1xuXHR9XG5cdFxuXHRpZiAoc2VsZi5pZ25vcmVMZXR0ZXJDYXNlKSB7XG5cdFx0dGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcblx0fVxuXHRcblx0cmV0dXJuIHRleHQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBcImNsZWFuZWRcIiB3b3JkLCBhY2NvcmRpbmcgdG8gdGhlIGNvbXBhcmlzb24gb3B0aW9ucyBzZXQuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0gICB7U3RyaW5nfSB3b3JkIC0gYSBzZXF1ZW5jZSBvZiBjaGFyYWN0ZXJzLCBzZXBhcmF0ZWQgYnkgb25lIFxuICogICAgICAgICAgICAgICAgICAgICAgICAgIG9yIG1vcmUgd2hpdGUgc3BhY2UgY2hhcmFjdGVycyAoc3BhY2UsIHRhYiwgbmV3bGluZSlcbiAqIEByZXR1cm5zIHtTdHJpbmd9ICAgICAgLSB0aGUgY2xlYW5lZCB3b3JkXG4gKi9cblNpbVRleHRlci5wcm90b3R5cGUuX2NsZWFuV29yZCA9IGZ1bmN0aW9uKHdvcmQpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0dW1sYXV0UnVsZXMgPSB7XG5cdFx0XHRcdCfDpCc6ICdhZScsXG5cdFx0ICBcdCfDtic6ICdvZScsXG5cdFx0ICBcdCfDvCc6ICd1ZScsXG5cdFx0ICBcdCfDnyc6ICdzcycsXG5cdFx0ICBcdCfDpic6ICdhZScsXG5cdFx0ICBcdCfFkyc6ICdvZScsXG5cdFx0ICBcdCfDhCc6ICdBRScsXG5cdFx0ICBcdCfDlic6ICdPRScsXG5cdFx0ICBcdCfDnCc6ICdVRScsXG5cdFx0ICBcdCfDhic6ICdBRScsXG5cdFx0ICBcdCfFkic6ICdPRSdcblx0XHRcdH0sXG5cdFx0XHR0b2tlbiA9IHdvcmQ7XG5cdFxuXHRpZiAoc2VsZi5yZXBsYWNlVW1sYXV0KSB7XG5cdFx0dG9rZW4gPSB3b3JkLnJlcGxhY2UoL8OkfMO2fMO8fMOffMOmfMWTfMOEfMOWfMOcfMOGfMWSL2csIGZ1bmN0aW9uKGtleSl7XG5cdFx0XHRyZXR1cm4gdW1sYXV0UnVsZXNba2V5XTtcblx0XHR9KTtcblx0fVxuXHRcblx0cmV0dXJuIHRva2VuO1xufTtcblxuLyoqXG4gKiBGaW5kcyB0aGUgbG9uZ2VzdCBjb21tb24gc3Vic3RyaW5nIGluIHRoZSBzb3VyY2UgYW5kIHRoZSB0YXJnZXQgdGV4dFxuICogYW5kIHJldHVybnMgdGhlIGJlc3QgbWF0Y2guXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0gICB7TnVtYmVyfSBzcmNUeHRJZHggICAgIC0gdGhlIGluZGV4IG9mIHRoZSBzb3VyY2UgdGV4dCBpbiB0ZXh0c1tdIFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvIGJlIGNvbXBhcmVkXG4gKiBAcGFyYW0gICB7TnVtYmVyfSB0cmdUeHRJZHggICAgIC0gdGhlIGluZGV4IG9mIHRoZSB0YXJnZXQgdGV4dCBpbiB0ZXh0c1tdIFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvIGJlIGNvbXBhcmVkXG4gKiBAcGFyYW0gICB7TnVtYmVyfSBzcmNUa0JlZ2luUG9zIC0gdGhlIGluZGV4IG9mIHRoZSB0b2tlbiBpbiB0b2tlbnNbXSBcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhdCB3aGljaCB0aGUgY29tcGFyaXNvbiBzaG91bGQgc3RhcnRcbiAqIEBwYXJhbSAgIHtBcnJheX0gIGZyd1JlZmVyZW5jZXMgLSB0aGUgYXJyYXkgb2YgZm9yd2FyZCByZWZlcmVuY2VzXG4gKiBAcmV0dXJucyB7TWF0Y2h9ICAgICAgICAgICAgICAgIC0gdGhlIGJlc3QgbWF0Y2hcbiAqL1xuU2ltVGV4dGVyLnByb3RvdHlwZS5fZ2V0QmVzdE1hdGNoID0gZnVuY3Rpb24oc3JjVHh0SWR4LCB0cmdUeHRJZHgsIHNyY1RrQmVnaW5Qb3MsIGZyd1JlZmVyZW5jZXMpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0YmVzdE1hdGNoLFxuXHRcdFx0YmVzdE1hdGNoVGtQb3MsXG5cdFx0XHRiZXN0TWF0Y2hMZW5ndGggPSAwLFxuXHRcdFx0c3JjVGtQb3MgPSAwLFxuXHRcdFx0dHJnVGtQb3MgPSAwO1xuXHRcblx0Zm9yICggdmFyIHRrUG9zID0gc3JjVGtCZWdpblBvcztcblx0XHQgICh0a1BvcyA+IDApICYmICh0a1BvcyA8IHNlbGYudG9rZW5zLmxlbmd0aCk7XG5cdFx0ICB0a1BvcyA9IGZyd1JlZmVyZW5jZXNbdGtQb3NdICAgICAgICAgICAgICAgICAgICkge1xuXHRcdFxuXHRcdC8vIElmIHRva2VuIG5vdCB3aXRoaW4gdGhlIHJhbmdlIG9mIHRoZSB0YXJnZXQgdGV4dCAgXG5cdFx0aWYgKHRrUG9zIDwgc2VsZi50ZXh0c1t0cmdUeHRJZHhdLnRrQmVnaW5Qb3MpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRcblx0XHR2YXIgbWluTWF0Y2hMZW5ndGggPSAoYmVzdE1hdGNoTGVuZ3RoID4gMCkgPyBiZXN0TWF0Y2hMZW5ndGggKyAxIDogc2VsZi5taW5NYXRjaExlbmd0aDtcblx0XHRcblx0XHRzcmNUa1BvcyA9IHNyY1RrQmVnaW5Qb3MgKyBtaW5NYXRjaExlbmd0aCAtIDE7XG5cdFx0dHJnVGtQb3MgPSB0a1BvcyArIG1pbk1hdGNoTGVuZ3RoIC0gMTtcblx0XHRcblx0XHQvLyBDb21wYXJlIGJhY2t3YXJkc1xuXHRcdGlmICggc3JjVGtQb3MgPCBzZWxmLnRleHRzW3NyY1R4dElkeF0udGtFbmRQb3MgJiZcblx0XHRcdFx0IHRyZ1RrUG9zIDwgc2VsZi50ZXh0c1t0cmdUeHRJZHhdLnRrRW5kUG9zICYmIFxuXHRcdFx0IFx0IChzcmNUa1BvcyArIG1pbk1hdGNoTGVuZ3RoKSA8PSB0cmdUa1BvcyAgICAgICkgeyAvLyBjaGVjayBpZiB0aGV5IG92ZXJsYXBcblx0XHRcdHZhciBjbnQgPSBtaW5NYXRjaExlbmd0aDtcblx0XHRcdFxuXHRcdFx0d2hpbGUgKGNudCA+IDAgJiYgc2VsZi50b2tlbnNbc3JjVGtQb3NdLnRleHQgPT09IHNlbGYudG9rZW5zW3RyZ1RrUG9zXS50ZXh0KSB7XG5cdFx0XHRcdHNyY1RrUG9zLS07XG5cdFx0XHRcdHRyZ1RrUG9zLS07XG5cdFx0XHRcdGNudC0tO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRpZiAoY250ID4gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdFxuXHRcdC8vIENvbXBhcmUgZm9yd2FyZHNcblx0XHR2YXIgbmV3TWF0Y2hMZW5ndGggPSBtaW5NYXRjaExlbmd0aDtcblx0XHRzcmNUa1BvcyA9IHNyY1RrQmVnaW5Qb3MgKyBtaW5NYXRjaExlbmd0aDtcblx0XHR0cmdUa1BvcyA9IHRrUG9zICsgbWluTWF0Y2hMZW5ndGg7XG5cdFx0XG5cdFx0d2hpbGUgKCBzcmNUa1BvcyA8IHNlbGYudGV4dHNbc3JjVHh0SWR4XS50a0VuZFBvcyAmJlxuXHRcdFx0XHRcdFx0dHJnVGtQb3MgPCBzZWxmLnRleHRzW3RyZ1R4dElkeF0udGtFbmRQb3MgJiYgXG5cdFx0XHRcdFx0XHQoc3JjVGtQb3MgKyBuZXdNYXRjaExlbmd0aCkgPCB0cmdUa1BvcyAgICAmJiAvLyBjaGVjayBpZiB0aGV5IG92ZXJsYXBcblx0XHRcdFx0XHRcdHNlbGYudG9rZW5zW3NyY1RrUG9zXS50ZXh0ID09PSBzZWxmLnRva2Vuc1t0cmdUa1Bvc10udGV4dCApIHtcblx0XHRcdHNyY1RrUG9zKys7XG5cdFx0XHR0cmdUa1BvcysrO1xuXHRcdFx0bmV3TWF0Y2hMZW5ndGgrKztcblx0XHR9XG5cdFx0XG5cdFx0Ly8gUmVjb3JkIG1hdGNoXG5cdFx0aWYgKG5ld01hdGNoTGVuZ3RoID49IHNlbGYubWluTWF0Y2hMZW5ndGggJiYgbmV3TWF0Y2hMZW5ndGggPiBiZXN0TWF0Y2hMZW5ndGgpIHtcblx0XHRcdGJlc3RNYXRjaExlbmd0aCA9IG5ld01hdGNoTGVuZ3RoO1xuXHRcdFx0YmVzdE1hdGNoVGtQb3MgID0gdGtQb3M7XG5cdFx0XHRiZXN0TWF0Y2ggPSBuZXcgTWF0Y2goc3JjVHh0SWR4LCBzcmNUa0JlZ2luUG9zLCB0cmdUeHRJZHgsIGJlc3RNYXRjaFRrUG9zLCBiZXN0TWF0Y2hMZW5ndGgpO1xuXHRcdH1cblx0fVxuXHRcdFx0XG5cdHJldHVybiBiZXN0TWF0Y2g7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYW4gYXJyYXkgb2YgSFRNTCBub2RlcywgY29udGFpbmluZyB0aGUgd2hvbGUgdGV4dCwgXG4gKiB0b2dldGhlciB3aXRoIHRoZSBoaWdodGxpZ2h0ZWQgbWF0Y2hlcy5cbiAqIFRoZSB0ZXh0IGNvbnRlbnQgb2YgZWFjaCBub2RlIGlzIHJldHJpZXZlZCBieSBzbGljaW5nIHRoZSBpbnB1dCB0ZXh0XG4gKiBhdCB0aGUgZmlyc3QgKHR4dEJlZ2luUG9zKSBhbmQgdGhlIGxhc3QgKHR4dEVuZFBvcykgY2hhcmFjdGVyIHBvc2l0aW9uIFxuICogb2YgZWFjaCBtYXRjaC5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSAgIHtBcnJheX0gaW5wdXRUZXh0cyAtIHRoZSBhcnJheSBvZiB7SW5wdXRUZXh0fSBvYmplY3RzLCBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCB3aGljaCBob2xkIGluZm9ybWF0aW9uIGFib3V0IGVhY2ggdXNlciBpbnB1dFxuICogQHBhcmFtICAge0FycmF5fSBtYXRjaGVzICAgIC0gdGhlIGFycmF5IHRoYXQgaG9sZHMgdGhlIHtNYXRjaFNlZ21lbnR9IG9iamVjdHMsIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IHN0b3JlZCBpbiBwYWlyc1xuICogQHJldHVybnMge0FycmF5fSAgICAgICAgICAgIC0gdGhlIGFycmF5IG9mIEhUTUwgbm9kZXMsIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IHdoaWNoIGhvbGRzIHRoZSB0ZXh0IGFuZCB0aGUgaGlnaGxpZ2h0ZWQgbWF0Y2hlc1xuICovXG5TaW1UZXh0ZXIucHJvdG90eXBlLl9nZXROb2RlcyA9IGZ1bmN0aW9uKGlucHV0VGV4dHMsIG1hdGNoZXMpIHtcblx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0aVRleHRzTGVuZ3RoID0gaW5wdXRUZXh0cy5sZW5ndGgsXG5cdFx0XHRub2RlcyA9IFtdO1xuXHRcblx0dmFyIHN0eWxlZE1hdGNoZXMgPSBzZWxmLl9hcHBseVN0eWxlcyhtYXRjaGVzKTtcblx0XHRcblx0Ly8gRm9yIGVhY2ggaW5wdXQgdGV4dFxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGlUZXh0c0xlbmd0aDsgaSsrKSB7XG5cdFx0dmFyIGlucHV0VGV4dCA9IGlucHV0VGV4dHNbaV0udGV4dCxcblx0XHRcdFx0Y2hJZHggPSAwLFxuXHRcdFx0XHRjaElkeExhc3QgPSBjaElkeCxcblx0XHRcdFx0Y2hFbmRQb3MgPSBpbnB1dFRleHQubGVuZ3RoLFxuXHRcdFx0XHRtSWR4ID0gMCxcblx0XHRcdFx0dHJnSWR4UmVmID0gKGkgPT0gMCkgPyAoaSArIDEpIDogKGkgLSAxKTtcblx0XHRcdFx0bm9kZXNbaV0gPSBbXTtcblx0XHRcblx0XHQvLyBTb3J0IGFycmF5IG9mIHNpbWlsYXJpdGllc1xuXHRcdHZhciBzb3J0ZWRNYXRjaGVzID0gc2VsZi5fc29ydFNpbWlsYXJpdGllcyhzdHlsZWRNYXRjaGVzLCBpKTtcblxuXHRcdC8vIEZvciBlYWNoIGNoYXJhY3RlciBwb3NpdGlvbiBpbiBpbnB1dCB0ZXh0XG5cdFx0d2hpbGUgKGNoSWR4IDw9IGNoRW5kUG9zKSB7XG5cdFx0XHRpZiAoc29ydGVkTWF0Y2hlcy5sZW5ndGggJiYgbUlkeCA8IHNvcnRlZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBtYXRjaCA9IHNvcnRlZE1hdGNoZXNbbUlkeF1baV07XG5cdFx0XHRcdC8vIEdldCBzdGFydCBjaGFyYWN0ZXIgcG9zaXRpb24gb2YgbWF0Y2ggc2VnbWVudFxuXHRcdFx0XHR2YXIgbVR4dEJlZ2luUG9zID0gbWF0Y2guZ2V0VHh0QmVnaW5Qb3Moc2VsZi50b2tlbnMpO1xuXHRcdFx0XHQvLyBHZXQgZW5kIGNoYXJhY3RlciBwb3NpdGlvbiBvZiBtYXRjaCBzZWdtZW50XG5cdFx0XHRcdHZhciBtVHh0RW5kUG9zID0gbWF0Y2guZ2V0VHh0RW5kUG9zKHNlbGYudG9rZW5zKTtcblx0XHRcdFx0XG5cdFx0XHRcdC8vIENyZWF0ZSB0ZXh0IG5vZGVcblx0XHRcdFx0dmFyIHRleHROb2RlU3RyID0gaW5wdXRUZXh0LnNsaWNlKGNoSWR4TGFzdCwgbVR4dEJlZ2luUG9zKTtcblx0XHRcdFx0dmFyIHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dE5vZGVTdHIpO1xuXHRcdFx0XHRub2Rlc1tpXS5wdXNoKHRleHROb2RlKTtcblx0XHRcdFx0XG5cdFx0XHRcdC8vIENyZWF0ZSBsaW5rIG5vZGUgZm9yIG1hdGNoIHNlZ21lbnRcblx0XHRcdFx0dmFyIGxpbmtOb2RlU3RyID0gaW5wdXRUZXh0LnNsaWNlKG1UeHRCZWdpblBvcywgbVR4dEVuZFBvcyk7XG5cdFx0XHRcdHZhciBsaW5rTm9kZSA9IG1hdGNoLmNyZWF0ZUxpbmtOb2RlKGxpbmtOb2RlU3RyLCBzb3J0ZWRNYXRjaGVzW21JZHhdW3RyZ0lkeFJlZl0pO1xuXHRcdFx0XHRub2Rlc1tpXS5wdXNoKGxpbmtOb2RlKTtcblx0XHRcdFx0XG5cdFx0XHRcdG1JZHgrKztcblx0XHRcdFx0Y2hJZHggPSBtVHh0RW5kUG9zO1xuXHRcdFx0XHRjaElkeExhc3QgPSBjaElkeDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBsYXN0VGV4dE5vZGVTdHIgPSBpbnB1dFRleHQuc2xpY2UoY2hJZHhMYXN0LCBjaEVuZFBvcyk7XG5cdFx0XHRcdHZhciBsYXN0VGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsYXN0VGV4dE5vZGVTdHIpO1xuXHRcdFx0XHRub2Rlc1tpXS5wdXNoKGxhc3RUZXh0Tm9kZSk7XG5cdFx0XHRcdGNoSWR4ID0gY2hFbmRQb3M7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2hJZHgrKztcblx0XHR9XG5cdH1cblx0XG5cdHJldHVybiBub2Rlcztcbn07XG5cbi8qKlxuICogUmV0dXJucyBhbiBhcnJheSBvZiBtYXRjaGVzLFxuICogd2hlcmUgZWFjaCBtYXRjaCBpcyBhbiBhcnJheSBvZiB0d28ge01hdGNoU2VnbWVudH0gb2JqZWN0cywgc3RvcmVkIGluIHBhaXJzLlxuICogQXQgaW5kZXggMCwgdGhlIHNvdXJjZSB7TWF0Y2hTZWdtZW50fSBvYmplY3QgaXMgc3RvcmVkLFxuICogYW5kIGF0IGluZGV4IDEsIHRoZSB0YXJnZXQge01hdGNoU2VnbWVudH0gb2JqZWN0LlxuICogQGZ1bmN0aW9uXG4gKiBAcGFyYW0gICB7TnVtYmVyfSBzcmNUeHRJZHggICAgIC0gdGhlIGluZGV4IG9mIHRoZSBzb3VyY2Uge1RleHR9IG9iamVjdCBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgaW4gdGV4dHNbXSB0byBiZSBjb21wYXJlZFxuICogQHBhcmFtICAge051bWJlcn0gdHJnVHh0SWR4ICAgICAtIHRoZSBpbmRleCBvZiB0aGUgdGFyZ2V0IHtUZXh0fSBvYmplY3QgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IGluIHRleHRzW10gdG8gYmUgY29tcGFyZWRcbiAqIEBwYXJhbSAgIHtBcnJheX0gIGZyd1JlZmVyZW5jZXMgLSB0aGUgYXJyYXkgb2YgZm9yd2FyZCByZWZlcmVuY2VzXG4gKiBAcmV0dXJucyB7QXJyYXl9ICAgICAgICAgICAgICAgIC0gdGhlIGFycmF5IHRoYXQgaG9sZHMgdGhlIHtNYXRjaFNlZ21lbnR9IFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgXHQgb2JqZWN0cywgc3RvcmVkIGluIHBhaXJzXG4gKi9cblNpbVRleHRlci5wcm90b3R5cGUuX2dldFNpbWlsYXJpdGllcyA9IGZ1bmN0aW9uKHNyY1R4dElkeCwgdHJnVHh0SWR4LCBmcndSZWZlcmVuY2VzKSB7XG5cdHZhciBzZWxmICAgICAgICAgPSB0aGlzLFxuXHRcdFx0c2ltaWxhcml0aWVzID0gW10sXG5cdFx0XHRzcmNUa1BvcyAgICAgPSBzZWxmLnRleHRzW3NyY1R4dElkeF0udGtCZWdpblBvcyxcblx0XHRcdHNyY1RrRW5kUG9zICA9IHNlbGYudGV4dHNbc3JjVHh0SWR4XS50a0VuZFBvcztcblxuXHR3aGlsZSAoKHNyY1RrUG9zICsgc2VsZi5taW5NYXRjaExlbmd0aCkgPD0gc3JjVGtFbmRQb3MpIHtcblx0XHR2YXIgYmVzdE1hdGNoID0gc2VsZi5fZ2V0QmVzdE1hdGNoKHNyY1R4dElkeCwgdHJnVHh0SWR4LCBzcmNUa1BvcywgZnJ3UmVmZXJlbmNlcyk7XG5cblx0XHRpZiAoYmVzdE1hdGNoICYmIGJlc3RNYXRjaC5tYXRjaExlbmd0aCA+IDApIHtcblx0XHRcdHNpbWlsYXJpdGllcy5wdXNoKFtcblx0XHRcdFx0XHRuZXcgTWF0Y2hTZWdtZW50KGJlc3RNYXRjaC5zcmNUeHRJZHgsIGJlc3RNYXRjaC5zcmNUa0JlZ2luUG9zLCBiZXN0TWF0Y2gubWF0Y2hMZW5ndGgpLCBcblx0XHRcdFx0XHRuZXcgTWF0Y2hTZWdtZW50KGJlc3RNYXRjaC50cmdUeHRJZHgsIGJlc3RNYXRjaC50cmdUa0JlZ2luUG9zLCBiZXN0TWF0Y2gubWF0Y2hMZW5ndGgpXG5cdFx0XHRcdF0pO1xuXHRcdFx0c3JjVGtQb3MgKz0gYmVzdE1hdGNoLm1hdGNoTGVuZ3RoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzcmNUa1BvcysrO1xuXHRcdH1cblx0fVxuXHRcblx0cmV0dXJuIHNpbWlsYXJpdGllcztcbn07XG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgZm9yd2FyZCByZWZlcmVuY2UgdGFibGUuXG4gKiBAZnVuY3Rpb25cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge1RleHR9ICAgdGV4dCAgICAgICAgICAtIGEge1RleHR9IG9iamVjdFxuICogQHBhcmFtIHtBcnJheX0gIGZyd1JlZmVyZW5jZXMgLSB0aGUgYXJyYXkgb2YgZm9yd2FyZCByZWZlcmVuY2VzIFxuICogQHBhcmFtIHtPYmplY3R9IG10c1RhZ3MgICAgICAgLSB0aGUgaGFzaCB0YWJsZSBvZiBtaW5NYXRjaExlbmd0aCBcbiAqIFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0IHNlcXVlbmNlIG9mIHRva2VucyAoTVRTKVxuICovXG5TaW1UZXh0ZXIucHJvdG90eXBlLl9tYWtlRm9yd2FyZFJlZmVyZW5jZXMgPSBmdW5jdGlvbih0ZXh0LCBmcndSZWZlcmVuY2VzLCBtdHNUYWdzKSB7XG5cdHZhclx0c2VsZiAgICAgID0gdGhpcyxcblx0XHR0eHRCZWdpblBvcyA9IHRleHQudGtCZWdpblBvcyxcblx0XHR0eHRFbmRQb3MgICA9IHRleHQudGtFbmRQb3M7XG5cdFx0XG5cdC8vIEZvciBlYWNoIHRva2VuIGluIHRva2Vuc1tdXG5cdGZvciAodmFyIGkgPSB0eHRCZWdpblBvczsgKGkgKyBzZWxmLm1pbk1hdGNoTGVuZ3RoIC0gMSkgPCB0eHRFbmRQb3M7IGkrKykge1xuXHRcdC8vIENvbmNhdGVuYXRlIHRva2VucyBvZiBtaW5pbXVtIG1hdGNoIGxlbmd0aFxuXHRcdHZhciB0YWcgPSBzZWxmLnRva2Vucy5zbGljZShpLCBpICsgc2VsZi5taW5NYXRjaExlbmd0aCkubWFwKGZ1bmN0aW9uKHRva2VuKSB7XG5cdFx0XHRyZXR1cm4gdG9rZW4udGV4dDtcblx0XHR9KS5qb2luKCcnKTtcblxuXHRcdC8vIElmIGhhc2ggdGFibGUgY29udGFpbnMgdGFnXG5cdFx0aWYgKHRhZyBpbiBtdHNUYWdzKSB7XG5cdFx0XHQvLyBTdG9yZSBjdXJyZW50IHRva2VuIHBvc2l0aW9uIGF0IGluZGV4IG10c1RhZ3NbdGFnXVxuXHRcdFx0ZnJ3UmVmZXJlbmNlc1ttdHNUYWdzW3RhZ11dID0gaTtcblx0XHR9XG5cdFx0Ly8gQWRkIHRhZyB0byBoYXNoIHRhYmxlIGFuZCBhc3NpZ24gY3VycmVudCB0b2tlbiBwb3NpdGlvbiB0byBpdFxuXHRcdG10c1RhZ3NbdGFnXSA9IGk7XG5cdH1cbn07XG5cbi8qKlxuICogUmVhZHMgdGhlIGlucHV0IHN0cmluZywgYW5kIGluaXRpYWxpemVzIHRleHRzW10gYW5kIHRva2Vuc1tdLlxuICogQ3JlYXRlcyBhbHNvIHRoZSBmb3J3YXJkIHJlZmVyZW5jZSB0YWJsZS5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGlucHV0VGV4dHMgICAgLSB0aGUgYXJyYXkgb2Yge0lucHV0VGV4dH0gb2JqZWN0c1xuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ICB0aGF0IGhvbGQgaW5mb3JtYXRpb24gb24gdGhlIHVzZXIgaW5wdXRcbiAqIEBwYXJhbSB7QXJyYXl9IGZyd1JlZmVyZW5jZXMgLSB0aGUgYXJyYXkgb2YgZm9yd2FyZCByZWZlcmVuY2VzXG4gKi9cblNpbVRleHRlci5wcm90b3R5cGUuX3JlYWRJbnB1dCA9IGZ1bmN0aW9uKGlucHV0VGV4dHMsIGZyd1JlZmVyZW5jZXMpIHtcblx0dmFyIHNlbGYgICAgICAgICA9IHRoaXMsXG5cdCAgICBtdHNIYXNoVGFibGUgPSB7fSxcblx0ICAgIGlMZW5ndGggICAgICA9IGlucHV0VGV4dHMubGVuZ3RoO1xuXHRcdFxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGlMZW5ndGg7IGkrKykge1xuXHRcdHZhciBpbnB1dFRleHQgPSBpbnB1dFRleHRzW2ldO1xuXHRcdC8vIENvbXB1dGUgdGV4dCdzIHdvcmRzXG5cdFx0dmFyIG5yT2ZXb3JkcyA9IGlucHV0VGV4dC50ZXh0Lm1hdGNoKC9bXlxcc10rL2cpLmxlbmd0aDtcblx0XHQvLyBJbml0aWFsaXplIHRleHRzW11cblx0XHRzZWxmLnRleHRzLnB1c2gobmV3IFRleHQoaW5wdXRUZXh0Lm1vZGUsIGlucHV0VGV4dC50ZXh0Lmxlbmd0aCwgbnJPZldvcmRzLCBpbnB1dFRleHQuZmlsZU5hbWUsIHNlbGYudG9rZW5zLmxlbmd0aCkpO1xuXHRcdC8vIEluaXRpYWxpemUgdG9rZW5zW11cblx0XHRzZWxmLl90b2tlbml6ZUlucHV0KGlucHV0VGV4dC50ZXh0KTtcblx0XHQvLyBVcGRhdGUgdGV4dCdzIGxhc3QgdG9rZW4gcG9zaXRpb25cblx0XHRzZWxmLnRleHRzW2ldLnRrRW5kUG9zID0gc2VsZi50b2tlbnMubGVuZ3RoO1xuXHRcdC8vIENyZWF0ZSBhcnJheSBvZiBmb3J3YXJkIHJlZmVyZW5jZXNcblx0XHRzZWxmLl9tYWtlRm9yd2FyZFJlZmVyZW5jZXMoc2VsZi50ZXh0c1tpXSwgZnJ3UmVmZXJlbmNlcywgbXRzSGFzaFRhYmxlKTtcblx0fVxufTtcblxuLyoqXG4gKiBTb3J0cyBtYXRjaGVzIGJ5IHNvdXJjZSBvciB0YXJnZXQge01hdGNoU2VnbWVudH0sXG4gKiBkZXBlbmRpbmcgb24gdGhlIGlkeCB2YWx1ZS5cbiAqIEBmdW5jdGlvblxuICogQHByaXZhdGVcbiAqIEBwYXJhbSAgIHtBcnJheX0gIG1hdGNoZXMgLSB0aGUgYXJyYXkgb2YgbWF0Y2hlcyB0byBiZSBzb3J0ZWRcbiAqIEBwYXJhbSAgIHtOdW1iZXJ9IGlkeCAgICAgLSB0aGUgaW5kZXggb2YgdGhlIGFycmF5IG9mIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCB0aGUge01hdGNoU2VnbWVudH0gb2JqZWN0c1xuICogQHJldHVybnMge0FycmF5fSAgICAgICAgICAtIHRoZSBzb3J0ZWQgYXJyYXkgb2YgbWF0Y2hlc1xuICovXG5TaW1UZXh0ZXIucHJvdG90eXBlLl9zb3J0U2ltaWxhcml0aWVzID0gZnVuY3Rpb24obWF0Y2hlcywgaWR4KSB7XG5cdHZhciBzb3J0ZWRTaW1zID0gbWF0Y2hlcy5zbGljZSgwKTtcblx0XG5cdHNvcnRlZFNpbXMuc29ydChmdW5jdGlvbihhLCBiKSB7XG5cdFx0dmFyIHBvcyA9IGFbaWR4XS50a0JlZ2luUG9zIC0gYltpZHhdLnRrQmVnaW5Qb3M7XG5cdFx0aWYgKHBvcykge1xuXHRcdFx0cmV0dXJuIHBvcztcblx0XHR9XG5cdFx0cmV0dXJuIGJbaWR4XS5tYXRjaExlbmd0aCAtIGFbaWR4XS5tYXRjaExlbmd0aDtcblx0fSk7XG5cdFxuXHRyZXR1cm4gc29ydGVkU2ltcztcbn07XG5cbi8qKlxuICogVG9rZW5pemVzIHRoZSBpbnB1dCBzdHJpbmcuXG4gKiBAcGFyYW0ge09iamVjdH0gaW5wdXRUZXh0IC0gdGhlIGlucHV0IHN0cmluZyB0byBiZSB0b2tlbml6ZWRcbiAqL1xuU2ltVGV4dGVyLnByb3RvdHlwZS5fdG9rZW5pemVJbnB1dCA9IGZ1bmN0aW9uKGlucHV0VGV4dCkge1xuXHR2YXIgc2VsZiAgICAgICAgPSB0aGlzLFxuXHRcdCAgd29yZFJlZ2V4ID0gL1teXFxzXSsvZyxcblx0XHQgIG1hdGNoO1xuXHRcblx0dmFyIGNsZWFuZWRUZXh0ID0gc2VsZi5fY2xlYW5JbnB1dFRleHQoaW5wdXRUZXh0KTtcblx0XHRcblx0d2hpbGUgKG1hdGNoID0gd29yZFJlZ2V4LmV4ZWMoY2xlYW5lZFRleHQpKSB7XG5cdFx0dmFyIHdvcmQgPSBtYXRjaFswXTtcblx0XHR2YXIgdG9rZW4gPSBzZWxmLl9jbGVhbldvcmQod29yZCk7XG5cdFx0XG5cdFx0aWYgKHRva2VuLmxlbmd0aCA+IDApIHtcblx0XHRcdHZhciB0eHRCZWdpblBvcyA9IG1hdGNoLmluZGV4O1xuXHRcdFx0dmFyIHR4dEVuZFBvcyAgID0gbWF0Y2guaW5kZXggKyB3b3JkLmxlbmd0aDtcblx0XHRcdC8vIEFkZCB0b2tlbiB0byB0b2tlbnNbXVxuXHRcdFx0c2VsZi50b2tlbnMucHVzaChuZXcgVG9rZW4odG9rZW4sIHR4dEJlZ2luUG9zLCB0eHRFbmRQb3MpKTtcblx0XHR9XG5cdH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2ltVGV4dGVyO1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7VGV4dH0sXG4gKiB3aGljaCBob2xkcyBpbmZvcm1hdGlvbiBvbiB0aGUgaW5wdXQgc3RyaW5nLlxuICogQGNvbnN0cnVjdG9yXG4gKiBAdGhpcyAge1RleHR9XG4gKiBAcGFyYW0ge1N0cmluZ30gaW5wdXRNb2RlICAgICAgLSB0aGUgbW9kZSBvZiB0aGUgaW5wdXQgKGkuZS4gJ0ZpbGUnIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgXHRvciAnVGV4dCcpXG4gKiBAcGFyYW0ge051bWJlcn0gbnJPZkNoYXJhY3RlcnMgLSB0aGUgdG90YWwgbnVtYmVyIG9mIGNoYXJhY3RlcnMgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBcdG9mIHRoZSBpbnB1dCBzdHJpbmdcbiAqIEBwYXJhbSB7TnVtYmVyfSBuck9mV29yZHMgICAgICAtIHRoZSB0b3RhbCBudW1iZXIgb2Ygd29yZHMgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCBcdG9mIHRoZSBpbnB1dCBzdHJpbmdcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlTmFtZSAgICAgICAtIHRoZSBuYW1lIG9mIHRoZSBmaWxlXG4gKiBAcGFyYW0ge051bWJlcn0gdGtCZWdpblBvcyAgICAgLSB0aGUgaW5kZXggKGluY2x1c2l2ZSkgb2YgdGhlIHRva2VuXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aW4ge1NpbVRleHRlci50b2tlbnNbXX0sIGF0IHdoaWNoIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgXHR0aGUgaW5wdXQgc3RyaW5nIHN0YXJ0cyBcbiAqIEBwYXJhbSB7TnVtYmVyfSB0a0VuZFBvcyAgICAgICAtIHRoZSBpbmRleCAobm9uLWluY2x1c2l2ZSkgb2YgdGhlIHRva2VuXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCAgaW4ge1NpbVRleHRlci50b2tlbnNbXX0sIGF0IHdoaWNoIFxuICogXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgXHR0aGUgaW5wdXQgc3RyaW5nIGVuZHMgXG4gKi9cbmZ1bmN0aW9uIFRleHQoaW5wdXRNb2RlLCBuck9mQ2hhcmFjdGVycywgbnJPZldvcmRzLCBmaWxlTmFtZSwgdGtCZWdpblBvcywgdGtFbmRQb3MpIHtcblx0dGhpcy5pbnB1dE1vZGUgICAgICA9IGlucHV0TW9kZTtcblx0dGhpcy5maWxlTmFtZSAgICAgICA9IGZpbGVOYW1lO1xuXHR0aGlzLnRrQmVnaW5Qb3MgICAgID0gdGtCZWdpblBvcyAgICAgfHwgMDtcblx0dGhpcy50a0VuZFBvcyAgICAgICA9IHRrRW5kUG9zICAgICAgIHx8IDA7XG5cdHRoaXMubnJPZkNoYXJhY3RlcnMgPSBuck9mQ2hhcmFjdGVycyB8fCAwO1xuXHR0aGlzLm5yT2ZXb3JkcyAgICAgID0gbnJPZldvcmRzICAgICAgfHwgMDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBUZXh0O1xuIiwiLyoganNoaW50IHVuZGVmOnRydWUsIHVudXNlZDp0cnVlLCBub2RlOnRydWUsIGJyb3dzZXI6dHJ1ZSAqL1xuJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgYSB7VG9rZW59LlxuICogQSB7VG9rZW59IHJlY29yZHMgdGhlIHN0YXJ0aW5nIGFuZCBlbmRpbmcgY2hhcmFjdGVyIHBvc2l0aW9uIFxuICogb2YgYSB3b3JkIGluIHRoZSBpbnB1dCBzdHJpbmcsIHRvIGZhY2lsaXRhdGUgcmVjb25zdHJ1Y3Rpb24gb2YgdGhlIGlucHV0XG4gKiBkdXJpbmcgb3V0cHV0IG9mIHRoZSBjb21wYXJpc29uIHJlc3VsdHMuXG4gKiBBIHdvcmQgaXMgYSBzZXF1ZW5jZSBvZiBjaGFyYWN0ZXJzLCBcbiAqIHNlcGFyYXRlZCBieSBvbmUgb3IgbW9yZSB3aGl0ZXNwYWNlcyBvciBuZXdsaW5lcy5cbiAqIFRoZSB0ZXh0IG9mIHRoZSB7VG9rZW59IGNvcnJlc3BvbmRzIHRvIHRoZSBcImNsZWFuZWRcIiB2ZXJzaW9uIG9mIGEgd29yZC4gXG4gKiBBbGwgY2hhcmFjdGVycywgYXMgZGVmaW5lZCBieSB0aGUgY29tcGFyaXNvbiBvcHRpb25zIHNldCBieSB0aGUgdXNlcixcbiAqIGFyZSByZW1vdmVkL3JlcGxhY2VkIGZyb20gdGhlIHRva2VuJ3MgdGV4dC5cbiAqIEBjb25zdHJ1Y3RvclxuICogQHRoaXMgIHtUb2tlbn1cbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0ICAgICAgICAtIHRoZSB0ZXh0IG9mIHRoZSB3b3JkIGFmdGVyIGJlaW5nIFwiY2xlYW5lZFwiIFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWNjb3JkaW5nIHRvIHRoZSBjb21wYXJpc29uIG9wdGlvbnMgXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXQgYnkgdGhlIHVzZXIgXG4gKiBAcGFyYW0ge051bWJlcn0gdHh0QmVnaW5Qb3MgLSB0aGUgaW5kZXggb2YgdGhlIHdvcmQncyBmaXJzdCBjaGFyYWN0ZXIgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgKGluY2x1c2l2ZSkgaW4gdGhlIGlucHV0IHN0cmluZ1xuICogQHBhcmFtIHtOdW1iZXJ9IHR4dEVuZFBvcyAgIC0gdGhlIGluZGV4IG9mIHRoZSB3b3JkJ3MgbGFzdCBjaGFyYWN0ZXIgXG4gKiBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQgKG5vbi1pbmNsdXNpdmUpIGluIHRoZSBpbnB1dCBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gVG9rZW4odGV4dCwgdHh0QmVnaW5Qb3MsIHR4dEVuZFBvcykge1xuXHR0aGlzLnRleHQgICAgICAgID0gdGV4dCAgICAgICAgfHwgJyc7XG5cdHRoaXMudHh0QmVnaW5Qb3MgPSB0eHRCZWdpblBvcyB8fCAwO1xuXHR0aGlzLnR4dEVuZFBvcyAgID0gdHh0RW5kUG9zICAgfHwgMDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBUb2tlbjtcbiJdfQ==
