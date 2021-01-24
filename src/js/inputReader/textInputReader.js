/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $       = require('jQuery');
var XRegExp = require('XRegExp');

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
