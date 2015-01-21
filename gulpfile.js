'use strict';
/*
 * This file is part of "Lassi".
 *    Copyright 2009-2012, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "Lassi" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "Lassi" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "Lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

/**
 * Fichier de construction et de gestion du projet.
 *
 * Installation des éléments externes (ckeditor, etc.)
 *  $$ gulp install
 *
 * Construction du projet
 *  $$ gulp build
 *
 * Développement
 *  $$ gulp start
 */

var
  gulp  = require('gulp'),
  sass  = require('gulp-sass'),
  jsdoc = require('gulp-jsdoc');


gulp.task('doc', function() {
  var infos = {
    plugins: ['plugins/markdown'],
    markdown: {
      parser: "gfm"
    }
  }
  gulp.src(['**/*.js', '!node_modules/**', '!gulpfile.js', 'README.md'])
    .pipe(jsdoc.parser(infos,'data'))
     .pipe(jsdoc.generator('./documentation'))
});

gulp.task('default', ['doc']);
