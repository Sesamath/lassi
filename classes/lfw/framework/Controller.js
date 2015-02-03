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

var _ = require('underscore')._;

lassi.Class('lfw.framework.Controller', {
  construct: function(path, respond) {
    this.path = path;
    this.actions = [];
    this.responses      = {};
    if(respond) this.respond(respond);

    // Backward compatibility
    this.Action = this.on;
  },

  respond: function(settings) {
    if (_.isString(settings)) settings = {format: settings};
    settings.format = settings.format || 'html';
    if (settings.format=='html') {
      settings.layout = settings.layout || 'page';
    }
    this.responses[settings.format] = settings;
    return this;
  },

  on: function(path, name) {
    var action = new lfw.framework.Action(path, name);
    this.actions.push(action)
    return action;
  },

  put: function(path, cb) {
    if (typeof path === 'function') {
      cb = path;
      path = undefined;
    }
    this.on(path).via('put').do(cb);
    return this;
  },
  post: function(path, cb) {
    if (typeof path === 'function') {
      cb = path;
      path = undefined;
    }
    this.on(path).via('post').do(cb);
    return this;
  },
  get: function(path, cb) {
    if (typeof path === 'function') {
      cb = path;
      path = undefined;
    }
    this.on(path).via('get').do(cb);
    return this;
  },
  delete: function(path, cb) {
    if (typeof path === 'function') {
      cb = path;
      path = undefined;
    }
    this.on(path).via('delete').do(cb);
    return this;
  },

  bless : function(file, component) {
    var _this = this;
    this.name = this.name || this.path || file.replace('.js', '');
    this.component = component;

    this.actions.forEach(function(action) {
      action.bless(_this);
    });

    if (_.isEmpty(this.responses)) this.respond('json');
    for(var format in this.responses) {
      var response = this.responses[format];
      if (response.format=='html') {
        if (!this.view) {
          this.view = this.name.replace('.', '-');
        }
      }
    }
    return this;
  },

  toAnsi: function() {
    var responses = [];
    var _this = this;
    _.each(this.responses, function(settings, format) {
      var s = [];
      _.each(settings, function(value, key) {
        if (key!='format') s.push(key.yellow+":".white+value.green);
      });
      if (format=='html') {
        s.push('view'.yellow+":".white+_this.view.green);
      }
      if (s.length) {
        responses.push(format.green+'('.white+s.join(',')+')');
      } else {
        responses.push(format.green);
      }
    });
    return " >> "+ responses.join(',');
  }
})

