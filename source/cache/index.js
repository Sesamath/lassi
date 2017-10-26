'use strict';
/*
* @preserve This file is part of "lassi".
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
* License along with "lassi"; if not, write to the Free
* Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
* 02110-1301 USA, or see the FSF site: http://www.fsf.org.
*/

const MemoryEngine = require('./MemoryEngine');
const MAX_TTL = 24*3600;

// une seule instance de client par type d'engine, même pour plusieurs CacheManager
let redisEngine
let memcacheEngine

/**
 * @constructor
 */
function CacheManager() {
  this.engines = [];
}

/**
 * Valeur max du ttl (24h, en s)
 * @type {number}
 */
CacheManager.MAX_TTL = MAX_TTL

/**
 * Affecte un nouvel engine
 * @param {String} driver le pilote à utiliser (memcache|redis|memory)
 * @param {Object} settings les réglages à envoyer au pilote (ou le client directement dans options.client dans le cas redis)
 */
CacheManager.prototype.addEngine = function (keyPrefix, driver, settings) {
  if (typeof keyPrefix !== 'string') throw new Error('keyPrefix must be a string (could be empty)')
  if (typeof driver !== 'string') throw new Error('driver must be a string')

  // on vérifie qu'on a pas déjà cet engine pour ce keyPrefix
  if (this.engines.some(e => e.keyPrefix === keyPrefix && e.engine === engine)) {
    console.error(new Error(`cacheEngine ${engine} already set for the key prefix ${keyPrefix}`))
    return
  }

  settings = settings || {};
  let engine;
  switch (driver) {
    case 'memory':
      engine = new MemoryEngine(settings);
      break;
    case 'memcache':
      if (!memcacheEngine) {
        const MemcacheEngine = require('./MemcacheEngine');
        const url = settings.host + ':' + settings.port;
        memcacheEngine = new MemcacheEngine(url);
      }
      engine = memcacheEngine
      break;
    case 'redis':
      if (!redisEngine) {
        const RedisEngine = require('./RedisEngine')
        redisEngine = new RedisEngine(settings)
      }
      engine = redisEngine
      break
    default:
      throw new Error(`Unknow cache engine ${driver}`);
  }
  this.engines.unshift({keyPrefix: keyPrefix, engine: engine, prefix: settings.prefix});
}

CacheManager.prototype.generateKey = function (engine, key) {
  key = key.replace(/[\x00-\x20\x7F-\xA0]/g, '');
  if (!engine.prefix) return key;
  return engine.prefix+'::'+key;
}

CacheManager.prototype.getRedisClient = function () {
  return redisEngine && redisEngine.client
}
CacheManager.prototype.getMemcacheClient = function () {
  return memcacheEngine && memcacheEngine.memcached
}

/**
 * Assigne une valeur dans le cache
 * @typedef cacheEngineSet
 * @type function
 * @param {string} key
 * @param {*} value
 * @param {number} [ttl=MAX_TTL] ttl en s
 * @param {errorCallback} callback
 */
CacheManager.prototype.set = function (key, value, ttl, callback) {
  if (!this.engines.length) return callback(new Error('You should add a cache engine before using it'))
  if (typeof ttl === 'function') {
    callback = ttl;
    ttl = MAX_TTL;
  }
  ttl = ttl || MAX_TTL;
  if (ttl > MAX_TTL || ttl < 1) {
    console.error(`Invalid ttl ${ttl}, fixed to ${MAX_TTL}`)
    ttl = MAX_TTL;
  }
  for(var i in this.engines) {
    if (key.indexOf(this.engines[i].keyPrefix)===0) {
      key = this.generateKey(this.engines[i], key);
      this.engines[i].engine.set(key, value, ttl, callback);
      break;
    }
  }
}

/**
 * Récupère une valeur dans le cache
 * @param key
 * @param callback appellée avec (error, value)
 */
CacheManager.prototype.get = function (key, callback) {
  if (!this.engines.length) return callback(new Error('You should add a cache engine before using it'))
  for(var i in this.engines) {
    if (key.indexOf(this.engines[i].keyPrefix)===0) {
      key = this.generateKey(this.engines[i], key);
      return this.engines[i].engine.get(key, callback);
    }
  }
}

/**
 * Efface une clé dans le cache
 * @param key
 * @param callback appelée avec (error)
 */
CacheManager.prototype.delete = function(key, callback) {
  if (!this.engines.length) return callback(new Error('You should add a cache engine before using it'))
  for(var i in this.engines) {
    if (key.indexOf(this.engines[i].keyPrefix)===0) {
      key = this.generateKey(this.engines[i], key);
      return this.engines[i].engine.delete(key, callback);
    }
  }
}

module.exports = CacheManager;

/**
 * @typedef CacheEngine
 * @type Object
 * @property {string} keyPrefix
 * @property {cacheEngineGet} get
 * @property {cacheEngineSet} set
 * @property {cacheEngineDelete} delete
 */
/**
 * @typedef cacheEngineGet
 * @type function
 * @param {string} key
 * @param {cacheEngineGetCallback} cb
 */
/**
 * @callback cacheEngineGetCallback
 * @param {Error|undefined} error
 * @param {*} value
 */
/**
 * @typedef cacheEngineSet
 * @type function
 * @param {string} key
 * @param {*} value
 * @param {number} [ttl=MAX_TTL] ttl en secondes
 * @param {errorCallback} cb
 */
/**
 * Appelée avec une erreur ou rien à la fin d'une opération qcq
 * @callback errorCallback
 * @param {Error|undefined} error
 */
