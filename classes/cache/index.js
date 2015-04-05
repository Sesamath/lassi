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

var MemoryEngine = require('./MemoryEngine');
/**
 * @constructor
 */
function CacheManager() {
  this.engines = [];
  this.addEngine('', 'memory', {});
}

/**
 * Vire les espaces et les caractères de contrôle d'une chaine
 * @see http://unicode-table.com/en/
 * @param {string} source La chaîne à nettoyer
 * @returns {string} La chaîne nettoyée
 */
function sanitizeHashKey(source) {
  return source.replace(/\x00-\x20\x7F-\xA0]/, '');
}

/**
 * Ajoute un nouvel engine sur un slot.
 * @param {String} slot le chemin de clef pris en charge par l'engine.
 * @param {String} drive le pilote à utiliser (memory, memcache)
 * @param {Object} settings les réglages à envoyer au pilote.
 */
CacheManager.prototype.addEngine = function(slot, driver, settings) {
  settings = settings || {};
  var engine;
  switch (driver) {
    case 'memory':
      engine = new MemoryEngine(settings);
      break;
    case 'memcache':
      var MemcacheEngine = require('./MemcacheEngine');
      engine = new MemcacheEngine(settings);
      break;
    default:
      throw new Error('Unknow cache engine '+driver);
  }

  this.engines.unshift({slot: slot, engine: engine});
}

/**
 * Assigne une valeur dans le cache
 * @param key
 * @param value
 * @param ttl
 * @param callback appelée avec (error)
 */
CacheManager.prototype.set = function(key, value, ttl, callback) {
  key = sanitizeHashKey(key);
  for(var i in this.engines) {
    if (key.indexOf(this.engines[i].slot)===0) {
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
CacheManager.prototype.get = function(key, callback) {
  key = sanitizeHashKey(key);
  for(var i in this.engines) {
    if (key.indexOf(this.engines[i].slot)===0) {
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
  key = sanitizeHashKey(key);
  for(var i in this.engines) {
    if (key.indexOf(this.engines[i].slot)===0) {
      return this.engines[i].engine.delete(key, callback);
    }
  }
}

module.exports = CacheManager;
