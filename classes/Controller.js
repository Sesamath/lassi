'use strict';
/*
 * @preserve This file is part of "lassi".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
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

var _            = require('underscore')._;
var Action       = require('./Action');
var util         = require('util');
var EventEmitter = require('events').EventEmitter

function Controller(path, respond) {
  this.path = path;
  this.actions = [];
  this.responses = {};
  if (respond) this.respond(respond);

  // Backward compatibility
  this.Action = this.on;
}
util.inherits(Controller, EventEmitter)

Controller.prototype.on = function(path) {
  var action = new Action(path);
  this.actions.push(action)
  return action;
}

Controller.prototype.put = function(path, cb) {
  if (typeof path === 'function') {
    cb = path;
    path = undefined;
  }
  this.on(path).via('put').do(cb);
  return this;
}
Controller.prototype.post = function(path, cb) {
  if (typeof path === 'function') {
    cb = path;
    path = undefined;
  }
  this.on(path).via('post').do(cb);
  return this;
}
Controller.prototype.get = function(path, cb) {
  if (typeof path === 'function') {
    cb = path;
    path = undefined;
  }
  this.on(path).via('get').do(cb);
  return this;
}
Controller.prototype.delete = function(path, cb) {
  if (typeof path === 'function') {
    cb = path;
    path = undefined;
  }
  this.on(path).via('delete').do(cb);
  return this;
}

Controller.prototype.serve = function(path, fsPath) {
  if (typeof fsPath==='undefined') {
    fsPath = path;
    path = '*';
  } else {
    path += '/*';
  }

  var action = new Action(path, fsPath);
  this.actions.push(action)
  return action;
}

Controller.prototype.bless = function(component) {
  var self = this;
  this.component = component;
  _.each(this._serve, function(serve) {
    serve.path = serve.path  || self.path;
  });
  this.actions.forEach(function(action) {
    action.bless(self);
  });

  return this;
}

Controller.prototype.renderAs = function(options) {
  this._renderAs = options;
  return this;
}

module.exports = function(path) {
  return new Controller(path);
}
