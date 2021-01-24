/* jshint undef:true, unused:true, node:true, browser:true */
'use strict';

var $           = require('jQuery');
var TargetMatch = require('../autoScroll/targetMatch.js');

/**
 * Creates an instance of a {View},
 * which implements all the UI logic of the application.
 * @constructor
 * @this  {View}
 * @param {Template} template - the object that appends/updates elements 
 * 															in the DOM
 */
function View(template) {
	this.template = template;
	this.results  = {};
	
	// Selectors
	this.$alertsPanel          = $('#alerts-panel');
	this.$compareBtn           = $('#compare-btn');
	this.$contentWrapper       = $('#content-wrapper');
	this.$file                 = $(':file');
	this.$htmlOptions          = $('#html-text-1, #html-text-2');
	this.$inputLnk             = $('#input-lnk');
	this.$inputPanel           = $('#input-panel');
	this.$inputPanes           = $('#input-pane-1, #input-pane-2');
	this.$inputFiles           = $('#input-file-1, #input-file-2');
	this.$inputTexts           = $('#input-text-1, #input-text-2');
	this.$outputPanel          = $('#output-panel');
	this.$outputTexts          = $('#comparison-output-1, #comparison-output-2');
	this.$outputTextContainers = $('#comparison-output-1 > .comparison-output-container, #comparison-output-2 > .comparison-output-container');
	this.$outputParagraphs     = $('#comparison-output-1 > .comparison-output-container > p, #comparison-output-2 > .comparison-output-container > p');
	this.$printBtn             = $('#print-btn');
	this.$settingsSidebar      = $('#settings-sidebar');
	this.$settingsSidebarLnk   = $('#settings-sidebar-lnk');
	this.$settingsSidebarPanes = $('#comparison-options-pane, #input-options-pane');
	this.$spinner              = $('#min-match-length-spinner');
	this.$tooltip              = $('[data-toggle="tooltip"], [rel="tooltip"]');
	
	this._resetTextInputTabPanes();
	this._updateOutputPanelHeight();
	this._updateAlertsPanelWidth();
}

/**
 * Binds events depending on the name specified.
 * @function
 * @param {String} event     - the name of the event
 * @param {Function} handler - the callback function
 */
View.prototype.bind = function(event, handler) {
	var self = this;
	
	switch (event) {
		case 'changeSpinnerInput':
			self.$spinner
				.on('change mousewheel DOMMouseScroll', 'input[type="text"]', function(e) {
						var elem = e.target;
						var id = self._getId(elem);
				  		var minMatchLength = parseInt($(elem).val(), 10);
				  		
				  		if (e.type === 'mousewheel' || e.type === 'DOMMouseScroll') {
					  		// scrolling up
				  			if (e.originalEvent.wheelDelta > 0 || e.originalEvent.detail < 0) {
						        minMatchLength += 1;
						    }
						    // scrolling down
						    else {
						        minMatchLength -= 1;
						    }
				  		}
				  		
				  		minMatchLength = (minMatchLength < 1) ? 1 : minMatchLength; 
						
						handler(id, minMatchLength);
				    	self.updateUIOption(id, 'inputText', minMatchLength);
					}
				)
				.on('click', '.btn', function(e) {
					e.stopPropagation();
					
					var $elem = $(e.delegateTarget).find('input[type="text"]');
					var id = self._getId($elem);
		  		var minMatchLength = parseInt($elem.val(), 10);
					
					if ($(e.currentTarget).hasClass('plus')) {
						minMatchLength += 1;
					} else {
						minMatchLength = (minMatchLength > 1) ? (minMatchLength - 1) : minMatchLength;
					}
					
					handler(id, minMatchLength);
				    self.updateUIOption(id, 'inputText', minMatchLength);
				});
			break;
			
		case 'compare':
			self.$compareBtn.on('click', function(e) {
				e.stopPropagation();
				
				$(this).tooltip('hide');
				self.$settingsSidebar.removeClass('expanded');
				setTimeout(function() {
					handler();
				}, 200);
			});
			break;
		
		case 'dismissAlert':
			self.$alertsPanel.on('click', '.alert', function() {
				$(this).remove();
			});
			break;
			
		case 'initBootstrap':
			self.$tooltip.tooltip({
				container : 'body',
				delay     : { "show": 800, "hide": 0 },
				html      : true,
				placement : 'bottom',
				trigger   : 'hover'
			});
			
			self.$file.filestyle({
				buttonName  : "btn-primary",
				buttonText  : "Browse file",
				placeholder : "No file selected",
				size        : "sm"
			});
			break;
			
		case 'inputFile':
			self.$inputFiles.on('change', function(e) {
				var elem = e.target;
				var id = self._getId(elem);
				
				var tabPaneId = self._getId($(elem).parents('.tab-pane'));
				self.toggleErrorStatus('hide', tabPaneId);
				
				var file = elem.files[0];
				var idx = self._getIndex(id);
				var loadingElem = $(elem).parent();
				handler(file, idx, loadingElem, tabPaneId);
			});
			break;
		
		case 'inputText':
			self.$inputTexts.on('change input', function(e) {
				var elem = e.target;
				var $elem = $(elem);
				var tabPaneId = self._getId($elem.parents('.tab-pane'));
				
				if (e.type === 'input') {
					self.toggleErrorStatus('hide', tabPaneId);
				}
				
				if (e.type === 'change') {
					var id = self._getId(elem);
					var text = $elem.val();
					var idx = self._getIndex(id);
					handler(text, idx, tabPaneId);
				}
			});
			break;
			
		case 'hidePrintDialog':
			self.$contentWrapper.on('hide.bs.modal', '.modal', function(e) {
				self._togglePrintDialog('hide', e.target);
			});
			break;
		
		case 'print':
			self.$contentWrapper.on('click', '#modal-print-btn', function(e) {
				e.stopPropagation();
				
				var inputComment1  = $('#input-comment-1').val();
				var inputComment2  = $('#input-comment-2').val();
				$('#print-comment-1').text(inputComment1);
				$('#print-comment-2').text(inputComment2);
				
				var hideModalPromise = $('.modal').modal('hide').promise();
				handler(hideModalPromise);
			});
			break;
		
		case 'resize':
			$(window).on('resize', function() {
				self._updateOutputPanelHeight();
				self._updateAlertsPanelWidth();
			});
			break;
			
		case 'scrollToMatch':
			self.$outputTexts.on('click', 'a', function(e) {
				e.preventDefault();
				e.stopPropagation();
				
				var targetMatch = new TargetMatch(e.target);
				var scrollPosition = targetMatch.getScrollPosition();
				targetMatch.scroll(scrollPosition);
			});
			break;
			
		case 'selectHTMLOption':
			self.$inputPanel.on('change', 'input[type="checkbox"]', function(e) {
				var elem = e.target;
				var id = self._getId(elem);
				var idx = self._getIndex(id);
				var newValue = $(elem).prop('checked');
				var text = self.$inputTexts.eq(idx).val();
				handler(idx, newValue, text);
			});
			break;
			
		case 'selectSettingsOption':
			self.$settingsSidebarPanes.on('change', 'input[type="checkbox"]', function(e) {
				var elem = e.target;
				var id = self._getId(elem);
				var newValue = $(elem).prop('checked');
				handler(id, newValue);
			});
			break;
			
		case 'selectTab':
			self.$inputPanes.on('shown.bs.tab', 'a[data-toggle="tab"]', function(e) {
				var lastTabPaneId = $(e.relatedTarget).attr('href');
				self.toggleErrorStatus('hide', lastTabPaneId);
				});
			break;
			
		case 'showPrintDialog':
			self.$printBtn.on('click', function(e) {
				e.stopPropagation();
				self._togglePrintDialog('show');
			});
			break;
			
		case 'toggleInputPanel':
			self.$inputLnk.on('click', function(e) {
				e.preventDefault();
				e.stopPropagation();
				// Hide tooltip (if any)
				$(this).tooltip('hide');
				self._toggleInputPanel('toggle');
			});
			break;
			
		case 'toggleSettingsSidebar':
			self.$settingsSidebarLnk.on('click', function(e) {
				e.preventDefault();
				e.stopPropagation();
				// Hide tooltip (if any)
				$(this).tooltip('hide');
				self.$settingsSidebar.toggleClass('expanded');
			});
		
			// Hide settings sidebar when clicking inside the 'nav' and '#content-wrapper' elements
			$('body').on('click', 'nav, #content-wrapper', function() {
				self.$settingsSidebar.removeClass('expanded');
			});
			break;
			
		case 'toggleSettingsSidebarPanes':
			self.$settingsSidebar.on('click', '.panel-title', function() {
				$(this).toggleClass('active');
			});
			break;
			
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Removes all <p> nodes from each output pane
 * and hides the output panel.
 * @function
 */
View.prototype.clearOutputPanel = function() {
	var self = this;
	
	self.$outputParagraphs.each(function() {
		$(this).remove();
	});
	self._toggleOutputPanel('hide');
	self.toggleWaitingCursor('hide');
};

/**
 * Clears all input from the "FILE" tab pane.
 * @function
 * @param {Number} idx - the number of the tab pane
 *                       0: for left-side pane, 1: for right-side pane
 */
View.prototype.clearTabPaneFileInput = function(idx) {
	var self = this;
	var tabPaneId = '#tab-file-' + (idx + 1);
	$(tabPaneId + ' input').filestyle('clear');
	self.toggleErrorStatus('hide', tabPaneId);
	self.loading('cancel', tabPaneId);
};

/**
 * Clears all input from the "TEXT" tab pane.
 * @function
 * @param {Number} idx - the number of the tab pane
 *                       0: for left-side pane, 1: for right-side pane
 */
View.prototype.clearTabPaneTextInput = function(idx) {
	var self = this;
	var tabPaneId = '#tab-text-' + (idx + 1);
	$(tabPaneId + ' textarea').val('');
	self.toggleErrorStatus('hide', tabPaneId);
};

/**
 * Creates the node templates.
 * @function
 */
View.prototype.createTemplates = function() {
	var self = this;
	self.template.createPrintSummary(self.results.texts, self.results.uniqueMatches);
	self.template.createStatistics(self.results.texts, self.results.uniqueMatches);
	self.template.createOutputTitles(self.results.texts);
};

/**
 * Returns the ids of active tab panes as an array of strings.
 * @function
 * @returns {Array<String>} - the ids of the active tab panes
 */
View.prototype.getActiveTabPaneIds = function() {
	var self = this,
		tabPaneIds = [];
		
	$('.tab-pane.active').each(function() {
		var tabPaneId = self._getId(this);
		tabPaneIds.push(tabPaneId);
	});
	return tabPaneIds;
};

/**
 * Shows/hides an node element depending on the event specified.
 * Used to show the progress of a process (e.g. input reading).
 * @function
 * @param {String} event  - the name of the event
 * @param {Object} target - the id of the node element
 */
View.prototype.loading = function(event, target) {
	var self = this;
	
	switch (event) {
		case 'start':
			self.toggleCompareBtn('disable');
			$(target).find('.fa').addClass('hidden');
			$(target).find('.fa-spinner').removeClass('hidden');
			break;
		
		case 'done':
			self.toggleCompareBtn('enable');
			$(target).find('.fa').addClass('hidden');
			$(target).find('.fa-check').removeClass('hidden');
			break;
			
		case 'cancel':
			self.toggleCompareBtn('enable');
			$(target).find('.fa').addClass('hidden');
			break;
			
		case 'error':
			self.toggleCompareBtn('enable');
			$(target).find('.fa').addClass('hidden');
			$(target).find('.fa-times').removeClass('hidden');
			break;
			
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Resets the scroll bars.
 * @function
 */
View.prototype.resetScrollbars = function() {
	var self = this;
	self.$outputTexts.scrollTop(0);
};

/**
 * Clears text from textarea and unchecks checkboxes.
 * Important for Internet Explorer, 
 * since it does not recognize the "autocomplete='off'" attribute.
 * @function
 * @private
 */
View.prototype._resetTextInputTabPanes = function() {
	var self = this;
	self.$htmlOptions.prop('checked', false);
	self.$inputTexts.val('');
};

/**
 * Displays a warning message.
 * @function
 * @param {String} type    - the type of the message
 * @param {String} message - the text of the message
 * @param {Number} delay   - the time in milliseconds, during which the message 
 *                           should remain visible
 */
View.prototype.showAlertMessage = function(type, message, delay) {
	var self = this,
			alertMessage = self.template.createAlertMessage(type, message);
	
	self.$alertsPanel.append($(alertMessage));
	setTimeout(function() {
		self.$alertsPanel.children().eq(0).remove();
	}, delay);
};

/**
 * Appends the array of nodes returned by the comparison 
 * to the <p> node element of each output pane 
 * and shows the output panel.
 * @function
 * @param {Array} nodes - the array of nodes returned by the comparison
 */
View.prototype.showSimilarities = function(nodes) {
	var self = this,
			nLength = nodes.length;
		
	for (var i = 0; i < nLength; i++) {
		var $p = $('<p>').append(nodes[i]);
		self.$outputTextContainers.eq(i).html($p);
	}
	
	self._toggleOutputPanel('show');
	setTimeout(function() {
		self._toggleInputPanel('hide');
	}, 100);
	
	self.toggleWaitingCursor('hide');
};

/**
 * Enables/disables the compare button
 * depending on the event specified.
 * @function
 * @param {String} event - the name of the event
 */
View.prototype.toggleCompareBtn = function(event) {
	var self = this;
	switch (event) {
		case 'enable':
			self.$compareBtn.prop('disabled', false);
			break;
			
		case 'disable':
			self.$compareBtn.prop('disabled', true);
			break;
		
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Toggles the class "has-error", 
 * which applies a red border around input node elements,
 * to prompt the user in case of erroneous input.
 * @function
 * @param {String} event     - the name of the event
 * @param {String} tabPaneId - the id of the tab pane
 */
View.prototype.toggleErrorStatus = function(event, tabPaneId) {
	switch (event) {
		case 'show':
			$(tabPaneId + ' .apply-error').addClass('has-error');
			break;
		
		case 'hide':
			$(tabPaneId + ' .apply-error').removeClass('has-error');
			break;
			
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Toggles the style of the cursor (from "default" to "waiting", and vice versa)
 * depending on the event specified.
 * @function
 * @param {String} event - the name of the event
 */
View.prototype.toggleWaitingCursor = function(event) {
	switch (event) {
		case 'show':
			document.body.className = 'waiting';
			break;
		
		case 'hide':
			document.body.className = '';
			break;
			
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Updates the value of a setting in the UI.
 * @function
 * @param {String}           id    - the id of the control element 
 * @param {String}           type  - the type of the control element
 * @param {(Boolean|Number)} value - the value of the setting
 */
View.prototype.updateUIOption = function(id, type, value) {
	switch (type) {
		case 'checkbox':
			$(id).prop('checked', value);
			break;
		case 'select':
			$(id).val(value);
			break;
		default:
			$(id).val(value);
	}
};

/**
 * Calculates the height of the output pane
 * so that it fits entirely in the window.
 * @function
 * @private
 */
View.prototype._computeOutputPanelHeight = function() {
	var self = this;
	var bodyHeight = $('body').outerHeight(true);
	var outputPos  = self.$outputPanel.offset().top;
	var outputTopPadding = parseInt(self.$outputPanel.css('padding-top'), 10);
	var elemPos    = self.$outputTexts.eq(0).offset().top;
	var posOffset  = (elemPos - outputPos);
	return bodyHeight - outputPos - (posOffset + outputTopPadding);
};

/**
 * Returns the id of a node element as a string (e.g. "#id").
 * @function
 * @param   {Object} target - the id of the node element
 * @returns {String}        - the string of the node element's id 
 */
View.prototype._getId = function(target) {
	return '#' + $(target).attr('id');
};

/**
 * Returns the number contained in the id of a node element.
 * @function
 * @private
 * @param   {String} id - the id of the node element
 * @returns {Number}    - the number of the id
 */
View.prototype._getIndex = function(id) {
	var tokens = id.split('-'); 
	var idx = tokens[tokens.length - 1];
	return parseInt(idx, 10) - 1;
};

View.prototype._toggleInputPanel = function(event) {
	var self = this;
	switch (event) {
		case 'toggle':
			$('.btn-group.open').removeClass('open');
			self.$inputPanel.toggleClass('expanded');
			break;
		
		case 'hide':
			self.$inputPanel.removeClass('expanded');
			break;
		
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Shows/hides the output panel depending on the event specified.
 * @function
 * @private
 * @param {String} event - the name of the event
 */
View.prototype._toggleOutputPanel = function(event) {
	var self = this;
	switch (event) {
		case 'show':
			self.$outputPanel.removeClass('invisible');
			break;
		
		case 'hide':
			self.$outputPanel.addClass('invisible');
			break;
			
		default:
			throw new Error('Event type not valid.'); 
	}
};

/**
 * Shows/hides the "PRINT OUTPUT" dialog depending on the event specified.
 * @function
 * @private
 * @param {String} event  - the name of the event
 * @param {Object} target - the node element to be removed
 */
View.prototype._togglePrintDialog = function(event, target) {
	var self = this;
	switch (event) {
		case 'show':
			var $printDialog = $(self.template.createPrintDialog(self.results.texts));
			self.$contentWrapper.append($printDialog);
			$printDialog.modal('show');
			break;
		
		case 'hide':
			$(target).remove();
			break;
			
		default:
			throw new Error('Event type not valid.');
	}
};

/**
 * Updates the width of the alerts' panel.
 * @function
 * @private
 */
View.prototype._updateAlertsPanelWidth = function() {
	var self        = this,
			marginLR      = 3 * 2,
			navWidth      = $('nav').width(),
			navLeftWidth  = $('nav .pull-left').outerWidth(),
			navRightWidth = $('nav .pull-right').outerWidth(),
			maxWidth      = navWidth - (navLeftWidth + navRightWidth + marginLR);
		
	self.$alertsPanel.css({
		'left'      : navLeftWidth + 'px',
		'max-width' : maxWidth + 'px'
	});
};

/**
 * Updates the height of each output pane.
 * @function
 * @private
 */
View.prototype._updateOutputPanelHeight = function() {
	var self = this,
			h = self._computeOutputPanelHeight();

	self.$outputTexts.each(function() {
		$(this).css('height', h + 'px');
	});
};

module.exports = View;
