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
var _ = require('underscore')._;
var Class = require('./Class');
module.exports = Class('Emitter', {
  type: 'mixin',
  construct: function() {
    this._listeners = {};
  },
  once: function(event, callback, context) {
    callback.__once__ = true;
    this.on(event, callback, context);
  },
  on: function(event, callback, context) {
    if (!this._listeners[event]) this._listeners[event] = [];
    if (context) callback = callback.bind(context);
    this._listeners[event].push(callback);
    return this;
  },
  emit: function() {
    var args = Array.prototype.slice.call(arguments);
    var event = args.shift();
    if (typeof this._listeners[event] === 'undefined') return;
    for (var i = this._listeners[event].length-1; i >=0; i--) {
      this._listeners[event][i].apply(this, args);
      if (this._listeners[event][i].__once__) {
        delete this._listeners[event][i];
      }
    }
  }
});


