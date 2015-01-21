"use strict";
/*
 * This file is part of "Collection".
 *    Copyright 2009-2012, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "Collection" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "Collection" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General public License for more details.
 *
 * You should have received a copy of the GNU General public
 * License along with "Collection"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */


var gulp    = require('gulp');
var sass    = require('gulp-sass');
require('lassi');

gulp.task('compile-sass', function () {
  gulp
    .src('construct/**/public/styles/*.scss', {base: './'})
    .pipe(sass({
      errLogToConsole: true,
      sourceComments: 'map'}))
    .pipe(gulp.dest('./'));
})

gulp.task('watch', function() {
  var launcher = new lassi.tools.Launcher({ path: 'construct/index.js' });
  launcher.observe('config').including('**/*.js').restart();
  launcher.observe('construct').including('**/*.+(js|dust)').excluding('**/public').restart();
  launcher.observe('construct').including('**/public/styles/**/*.scss').do(function() { gulp.start('compile-sass') });
  launcher.observe('construct').including('**/public/**/*.+(css|js)').reload();
  launcher.observe('node_modules/lassi').including('**/*.js').excluding('**/node_modules').restart();
  launcher.start();
})



