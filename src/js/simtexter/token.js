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
