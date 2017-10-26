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

var redis = require('redis');

/**
 * Constructeur du client redis
 * @param {object} settings cf https://github.com/NodeRedis/node_redis#rediscreateclient
 * @constructor
 */
function RedisEngine (settings) {
  // @see https://github.com/NodeRedis/node_redis#rediscreateclient
  this.client = redis.createClient(settings)
}

/**
 * Retourne une valeur de cache
 * @param {string} key
 * @param callback
 */
RedisEngine.prototype.get = function (key, callback) {
  this.client.get(key, function (error, data) {
    if (error) return callback(error)
    callback(null, JSON.parse(data))
  })
}

/**
 * Affecte une valeur de cache
 * @param key
 * @param value
 * @param {number} ttl ttl en secondes
 * @param callback
 */
RedisEngine.prototype.set = function (key, value, ttl, callback) {
  // Si on ne passe pas de callback on met au moins les erreurs en console
  if (!callback) callback = (error) => error && console.error(error)
  this.client.set(key, JSON.stringify(value), 'EX', ttl, callback)
}

RedisEngine.prototype.delete = function (key, callback) {
  this.client.del(key, callback)
}

module.exports = RedisEngine;
