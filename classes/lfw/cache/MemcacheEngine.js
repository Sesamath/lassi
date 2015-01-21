'use strict';
/*
 * @preserve This file is part of "lfw.example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lfw.example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lfw.example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lfw.example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var Memcached = require('memcached');
lassi.Class('lfw.cache.MemcacheEngine', {
  extend: lfw.cache.Engine,
  construct: function(settings) {
    this.memcached = new Memcached(settings);
  },
  get: function(key, callback) {
    this.memcached.get(lassi.tools.sanitizeHashKey(key), callback);
  },
  set: function(key, value, ttl, callback) {
    this.memcached.set(lassi.tools.sanitizeHashKey(key), value, ttl, callback);
  },
  delete: function(key, callback) {
    this.memcached.del(lassi.tools.sanitizeHashKey(key), callback);
  }
})
