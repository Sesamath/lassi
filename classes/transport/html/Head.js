'use strict';
/*
* @preserve This file is part of "lassi".
*    Copyright 2009-2014,
*    Author :
*    eMail  :
*    Site   :
*
* "lassi" is free software; you can redistribute it and/or
* modify it under the terms of the GNU General Public License as
* published by the Free Software Foundation; either version 2.1 of
* the License, or (at your option) any later version.
*
* "lassi" is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* General Public License for more details.
*
* You should have received a copy of the GNU General Public
* License along with "lassi"; if not, write to the Free
* Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
* 02110-1301 USA, or see the FSF site: http://www.fsf.org.
*/
var _            = require('lodash');

function Head() {
  this.items = [];
  this.addMeta({'http-equiv': 'X-UA-Compatible', content: 'IE=EDGE'});
  this.items.push('<meta charset="utf-8" />');
}

Head.prototype.renderAttributes = function(attributes) {
  if (_.isUndefined(attributes) || _.isEmpty(attributes)) return '';
  var output = [];
  _.each(attributes, function(value, key) {
    output.push(key+'="'+value+'"');
  });
  return ' '+output.join(' ');
}

Head.prototype.add = function(tag, attributes, content) {
  var output = '<'+tag+this.renderAttributes(attributes);
  if (typeof content === 'undefined') {
    output+= '/>';
  } else {
    output+= '>'+content+'</'+tag+'>';
  }
  this.items.push(output);
}

Head.prototype.addLink = function(rel, href, attributes) {
  attributes = attributes || {};
  _.extend(attributes, {rel: rel, href: href});
  this.add('link', attributes);
}


Head.prototype.addMeta = function(attributes) {
  this.add('meta', attributes);
}

Head.prototype.addMetaProperty = function(property, content) {
  this.addMeta({property: property, content: content});
}

Head.prototype.addMetaName = function(name, content) {
  this.addMeta({name: name, content: content});
}

Head.prototype.render = function() {
  return this.items.join('');
}

module.exports = Head;
