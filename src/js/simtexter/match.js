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
