'use strict';

// Dependencies
var browserify  = require('browserify');
var del         = require('del');
var gulp        = require('gulp');
var prefix      = require('gulp-autoprefixer');
var jshint      = require('gulp-jshint');
var less        = require('gulp-less');
var minifyCSS   = require('gulp-minify-css');
var rename      = require('gulp-rename');
var sourcemaps  = require('gulp-sourcemaps');
var uglify      = require('gulp-uglify');
var gutil       = require('gulp-util');
var runSequence = require('run-sequence');
var buffer      = require('vinyl-buffer');
var source      = require('vinyl-source-stream');

gulp.task('clean', false, function(cb) {
	return del(['./dist'], cb);
});

gulp.task('copy-assets', ['clean'], function() {
	return gulp.src('./src/public/**/*')
		.pipe(gulp.dest('./dist/'));
});

// Compile .less files
gulp.task('build-css', function() {
	return gulp.src('./src/less/styles.less')
		.pipe(less())
	    .pipe(prefix({ cascade: true }))
	    .pipe(rename({ extname: '.css' }))
	    .pipe(gulp.dest('./dist/assets/css/'));
});

// Minify .css file
gulp.task('minify-css', ['build-css'], function() {
	return gulp.src('./dist/assets/css/styles.css')
    	.pipe(minifyCSS())
    	.pipe(rename({ suffix: '.min' }))
    	.pipe(gulp.dest('./dist/assets/css/'));
});

// Check syntax of source code
gulp.task('check-js', function() {
	return gulp.src('./src/js/**/*.js')
    	.pipe(jshint())
    	.pipe(jshint.reporter('jshint-stylish'))
    	.on('error', gutil.log);
});

// Build source code
gulp.task('build-js', ['check-js'], function() {
	// set up the browserify instance on a task basis
	var b = browserify({
		entries : './src/js/main.js',
		debug : true
	});

	return b.bundle()
		.pipe(source('app.js'))
		.pipe(buffer())
		// Write script to path
		.pipe(gulp.dest('./dist/assets/js/'))
		.pipe(sourcemaps.init({ loadMaps : true }))
		// Minify source code
		.pipe(uglify()).on('error', gutil.log)
		.pipe(rename({ suffix: '.min' }))
		// Write sourcemap to relative path
		.pipe(sourcemaps.write('./'))
		// Write minified script to path
		.pipe(gulp.dest('./dist/assets/js/'));
});

gulp.task('watch-new-files', function(cb) {
	runSequence('copy-assets', 'build-js', 'minify-css', cb);
});

gulp.task('watch', function() {
	gulp.watch('./src/js/**/*.js',     ['build-js']);
	gulp.watch('./src/less/**/*.less', ['minify-css']);
	gulp.watch('./src/public/**/*',    ['watch-new-files']);
});

// Tasks
gulp.task('build', function(cb) {
	runSequence('copy-assets', 'build-js', 'minify-css', cb);	
});
gulp.task('default', ['build', 'watch']);
