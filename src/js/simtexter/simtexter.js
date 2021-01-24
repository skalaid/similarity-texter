/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $            = require('jQuery');
var XRegExp      = require('XRegExp');
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
