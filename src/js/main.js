/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $   = require('jQuery');
var App = require('./app/app.js');

// Main execution entry point
$(window).load(function() {
	setTimeout(function() {
		$(".loader").addClass('shrinked');
		var app = new App('simtexter');
	}, 700);
});
