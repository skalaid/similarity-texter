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