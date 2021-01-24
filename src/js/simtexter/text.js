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
