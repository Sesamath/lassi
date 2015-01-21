'use strict';
/*
 * @preserve This file is part of "lassi-example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

lassi.Class('lfw.cache.Manager', {
  construct: function() {
    this.engines = [];
    this.addEngine('', new lfw.cache.MemoryEngine());
  },
  addEngine: function(slot, engine) {
    if (typeof slot === 'object') {
      engine = slot;
      slot = '';
    }
    this.engines.unshift({slot: slot, engine: engine});
  },
  set: function(key, value, ttl, callback) {
    for(var i in this.engines) {
      if (key.indexOf(this.engines[i].slot)===0) {
        this.engines[i].engine.set(key, value, ttl, callback);
        break;
      }
    }
  },
  get: function(key, callback) {
    for(var i in this.engines) {
      if (key.indexOf(this.engines[i].slot)===0) {
        return this.engines[i].engine.get(key, callback);
      }
    }
  }
})

