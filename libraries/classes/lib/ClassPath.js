'use strict';
/*
 * @preserve This file is part of "arf-classes".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "arf-classes" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "arf-classes" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "arf-classes"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var NameSpace = require('./NameSpace');

function ClassPath() {
  this.definitions = {};
}

ClassPath.prototype.defineClass = function (namespace, file) {
  var fs = require('fs');
  var pathLib = require('path');
  var definition = {
    namespace: namespace,
    name: pathLib.basename(file, '.js'),
    file: file,
    annotations: {}
  }
  this.definitions[namespace.name+'.'+definition.name] = definition;
  var classGetter = (function(definition) {
    return function() {
      if (!this.classes) this.classes = {};
      if (!this.classes.hasOwnProperty(definition.name)) require(definition.file);
      return this.classes[definition.name];
    }
  })(definition);

  var commentRegExp = /(\/\*\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*+\/)\n\s*(.+?)[\r\n]/g;
  var annotationRegExp = /\@([A-Za-z]+)(\s+(.+))?/;
  var memberRegExp = /^(\S+)\s*:/;
  var classRegExp = /^\S+\s*\(\s*'(\S+)'\s*,\s+\{/;
  var text = fs.readFileSync(file);
  var match, match1, annotations, comments, i, symbol;
  while ((match=commentRegExp.exec(text)) !== null) {
    if (match1 = classRegExp.exec(match[5])) {
      symbol = 'class';
    } else if (match1 = memberRegExp.exec(match[5])) {
      symbol = match1[1];
    } else {
      continue;
    }
    annotations = definition.annotations[symbol] = {text:[]};
    comments = match[1].split(/[\/\*\s]*[\r\n][\/\*\s]*/);
    for (i in comments) {
      if (!comments[i].length) continue;
      if (match1 = annotationRegExp.exec(comments[i])) {
        annotations[match1[1]] = undefined === match1[3]?true:match1[3];
      } else {
        annotations.text.push(comments[i]);
      }
    }

  }
  Object.defineProperty(namespace, definition.name, { get: classGetter });
}

ClassPath.prototype.addPath = function(path, pkg) {
  var fs = require('fs');
  var root = GLOBAL;
  if (pkg) root = pkg;
  var files = fs.readdirSync(path);
  var stat, file;
  for (var i in files) {
    file = path + '/' + files[i];
    if (stat = fs.statSync(file)) {
      if (stat.isDirectory()) {
        if (!root.hasOwnProperty(files[i])) {
          root[files[i]] = new NameSpace(root, files[i]);
        }
        this.addPath(file, root[files[i]]);
      } else {
        this.defineClass(root, file);
      }
    }
  }
}

module.exports = ClassPath;
