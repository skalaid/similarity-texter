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
