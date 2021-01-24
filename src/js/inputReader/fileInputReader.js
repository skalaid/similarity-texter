/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $     = require('jQuery');
var JSZip = require('JSZip');

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
