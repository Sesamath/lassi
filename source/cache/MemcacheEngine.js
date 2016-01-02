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

var Memcached = require('memcached');

function MemcacheEngine(settings) {
  this.memcached = new Memcached(settings);
}

MemcacheEngine.prototype.get = function(key, callback) {
  this.memcached.get(key, callback);
}

MemcacheEngine.prototype.set = function(key, value, ttl, callback) {
  this.memcached.set(key, value, ttl, callback);
}

MemcacheEngine.prototype.delete = function(key, callback) {
  this.memcached.del(key, callback);
}

module.exports = MemcacheEngine;
