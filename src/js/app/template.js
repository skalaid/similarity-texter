/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

/**
 * Creates an instance of a {Template},
 * which appends node elements in the DOM or updates their inner content. 
 * @constructor
 * @this {Template}
 */
function Template() {
}

/**
 * Returns the node element of the template
 * for displaying warning messages.
 * @function
 * @param   {String} type    - the type of warning
 * @param   {String} message - the text of the warning message
 * @returns {Object}         - the top node element
 */
Template.prototype.createAlertMessage = function(type, message) {
	var div = document.createElement('div');
		
	div.className = 'alert alert-warning';
	div.innerHTML = [
			'<table class="table table-condensed">',
				'<tbody>',
					'<tr>',
						'<td class="h5"><i class="fa fa-exclamation-circle"></i></td>',
						'<td>',
							'<h5>', type, '</h5>',
							'<p>', message, '</p>',
						'</td>',
					'</tr>',
				'</tbody>',
			'</table>'
		].join('');
		
	return div;
};

/**
 * Updates the inner HTML content of the output titles.
 * @function
 * @param {Array} texts - the array that holds information about the user input
 */
Template.prototype.createOutputTitles = function(texts) {
	var targets = [ document.getElementById('output-title-1'), document.getElementById('output-title-2') ],
	    tLength = targets.length;
		
	for (var i = 0; i < tLength; i++) {
		var fileName = texts[i].fileName || '';
		var mode     = texts[i].inputMode;
		var target   = targets[i];
		target.innerHTML = [
				'<p><b>', mode.toUpperCase(), ': </b>', fileName, '</p> ',
			].join('');
	}
};

/**
 * Returns the node element of the template
 * for displaying the "PRINT OUTPUT" dialog.
 * @function
 * @param   {Array} texts - the array that holds information 
 * 													about the user input
 * @returns {Object}      - the top node element
 */
Template.prototype.createPrintDialog = function(texts) {
	var section = document.createElement('section');
	
	section.id = 'modal-print';
	section.className = 'modal fade';
	section.setAttribute('tabindex', '-1');
	section.setAttribute('role', 'dialog');
	section.innerHTML = [
			'<div class="modal-dialog">',
	      '<div class="modal-content">',
          '<div class="modal-header">',
            '<button type="button" class="close" data-dismiss="modal" aria-label="Close">',
              '<span aria-hidden="true">&times;</span>',
            '</button>',
            '<h4 class="modal-title">Print output</h4>',
          '</div>',
          '<div class="modal-body">',
            '<div class="row">',
              '<div class="col-xs-6">',
                '<div class="form-group form-group-sm">',
                  '<label for="input-comment-1">1: Comment for ', texts[0].inputMode, '</label>',
                  '<textarea id="input-comment-1" class="form-control" rows="5" autocomplete="off" placeholder="Type a comment"></textarea>',
                '</div>',
              '</div>',
              '<div class="col-xs-6">',
                '<div class="form-group form-group-sm">',
                  '<label for="input-comment-2">2: Comment for ', texts[1].inputMode, '</label>',
                  '<textarea id="input-comment-2" class="form-control" rows="5" autocomplete="off" placeholder="Type a comment"></textarea>',
                '</div>',
              '</div>',
            '</div>',
          '</div>',
          '<div class="modal-footer">',
            '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancel</button>',
            '<button id="modal-print-btn" type="button" class="btn btn-primary btn-sm">Print</button>',
          '</div>',
	      '</div>',
      '</div>'
		].join('');
		
	return section;
};

/**
 * Updates the inner HTML content of the hidden, on screen, node element
 * that holds the information (statistics & comments) to be printed.
 * @function
 * @param {Array}  texts         - the array that holds information 
 * 																 about the user input
 * @param {Number} uniqueMatches - the number of the unique matches found
 */
Template.prototype.createPrintSummary = function(texts, uniqueMatches) {
	var target = document.getElementById('print-summary');
		
	target.innerHTML = [
			'<h4>COMPARISON SUMMARY</h4>',
			'<h6>DATE/TIME: ', (new Date()).toUTCString(), '</h6>',
		  '<table class="table table-condensed table-bordered">',
	      '<thead>',
	        '<tr>',
	          '<th class="col-xs-2"></th>',
	          '<th class="col-xs-5">', texts[0].fileName, '</th>',
	          '<th class="col-xs-5">', texts[1].fileName, '</th>',
	        '</tr>',
	      '</thead>',
	      '<tbody>',
	      	'<tr>',
	          '<th>Comment</th>',
	          '<td id="print-comment-1"></td>',
	          '<td id="print-comment-2"></td>',
	        '</tr>',
	        '<tr>',
	          '<th>Type</th>',
	          '<td>', texts[0].inputMode, '</td>',
	          '<td>', texts[1].inputMode, '</td>',
	        '</tr>',
	        '<tr>',
	          '<th>Characters</th>',
	          '<td>', texts[0].nrOfCharacters, '</td>',
	          '<td>', texts[1].nrOfCharacters, '</td>',
	        '</tr>',
	        '<tr>',
	          '<th>Words</th>',
	          '<td>', texts[0].nrOfWords, '</td>',
	          '<td>', texts[1].nrOfWords, '</td>',
	        '</tr>',
	        '<tr>',
	          '<th>Unique matches</th>',
	          '<td colspan="2">', uniqueMatches, '</td>',
	        '</tr>',
	      '</tbody>',
		  '</table>'
		].join('');
};

/**
 * Updates the inner HTML content
 * of the node element that holds the statistical data. 
 * @function
 * @param {Array}  texts         - the array that holds information 
 * 																 about the user input
 * @param {Number} uniqueMatches - the number of the unique matches found
 */
Template.prototype.createStatistics = function(texts, uniqueMatches) {
	var target = document.getElementById('statistics');
		
	target.innerHTML = [
		  '<table class="table table-condensed table-bordered">',
	      '<thead>',
          '<tr>',
            '<th class="col-xs-2"></th>',
            '<th class="col-xs-5">', texts[0].fileName, '</th>',
            '<th class="col-xs-5">', texts[1].fileName, '</th>',
          '</tr>',
	      '</thead>',
	      '<tbody>',
          '<tr>',
            '<th>Type</th>',
            '<td>', texts[0].inputMode, '</td>',
            '<td>', texts[1].inputMode, '</td>',
          '</tr>',
          '<tr>',
            '<th>Characters</th>',
            '<td>', texts[0].nrOfCharacters, '</td>',
            '<td>', texts[1].nrOfCharacters, '</td>',
          '</tr>',
          '<tr>',
            '<th>Words</th>',
            '<td>', texts[0].nrOfWords, '</td>',
            '<td>', texts[1].nrOfWords, '</td>',
          '</tr>',
          '<tr>',
            '<th>Unique matches</th>',
            '<td colspan="2">', uniqueMatches, '</td>',
          '</tr>',
	      '</tbody>',
		  '</table>'
		].join('');
};

module.exports = Template;