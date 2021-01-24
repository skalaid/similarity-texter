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
