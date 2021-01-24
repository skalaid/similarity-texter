/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $              = require('jQuery');
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