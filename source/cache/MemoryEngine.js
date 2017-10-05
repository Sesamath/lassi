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


function MemoryEngine() {
  console.error('MemoryEngine isn’t designed for production')
  this.cache = {};
}

MemoryEngine.prototype.get = function(key, callback) {
  var record = this.cache[key];
  if(record) {
    var ttl = record.deathTime - new Date();
    if (ttl>0) return callback(null, record.value);
  }
  callback(null, false);
}

MemoryEngine.prototype.set = function(key, value, ttl, callback) {
  this.cache[key] = {
    value: value,
    deathTime: 0
  }
  var now = new Date().getTime();
  if (ttl) this.cache[key].deathTime = new Date (now+1000*ttl);
  callback();
}

MemoryEngine.prototype.delete = function(key, callback) {
  delete this.cache[key];
  callback();
}

module.exports = MemoryEngine;
