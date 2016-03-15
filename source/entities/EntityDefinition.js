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
var _            = require('lodash');
var Entity = require('./Entity');
var EntityQuery = require('./EntityQuery');
var flow = require('an-flow');

function fooCb(cb) { cb(); }

/**
 * Construction d'une définition d'entité. Passez par la méthode {@link Component#entity} pour créer une entité.
 * @constructor
 * @param {String} name le nom de l'entité
 */
function EntityDefinition(name) {
  this.name = name;
  this.indexes = {};
  this._beforeStore = this._afterStore = fooCb;
}

/**
 * Ajoute un indexe à l'entité. Contrairement à la logique SGBD, on ne type pas
 * l'indexe. En réalité il faut comprendre un index comme "Utilise la valeur du
 * champ XXX et indexe-la".
 *
 * Une callback peut être fournie pour fabriquer des valeurs virtuelles. Par exemple :
 * ```javascript
 *  entity.index('age', 'integer', function() {
 *    return (new Date()).getFullYear() - this.born.getFullYear();
 *  });
 * ```
 *
 * @param {String} fieldName Nom du champ à indexer
 * @param {String} fieldType Type du champ à indexer ('integer', 'string', 'date')
 * @param {Function} callback Cette fonction permet de définir virtuellement la valeur d'un index.
 * @return {Entity} l'entité (chaînable)
 */
EntityDefinition.prototype.defineIndex = function(fieldName, fieldType, callback) {
  this.indexes[fieldName] = {
    callback: callback?callback:function() { return this[fieldName]; },
    fieldType: fieldType,
    fieldName: fieldName
  };
  return this;
}

/**
 * Finalisation de l'objet Entité.
 * @param {Entities} entities le conteneur d'entités.
 * @return {Entity} l'entité (chaînable)
 * @private
 */
EntityDefinition.prototype.bless = function(entities) {
  if (this.configure) this.configure();
  this.entities = entities;
  this.table = this.table || (this.name[0].toLowerCase()+this.name.substr(1)).replace(/([A-Z])/g, function($1){return '_'+$1.toLowerCase();});
  this.entityClass = this.entityClass || function() {};
  return this;
}

/**
 * Retourne une instance {@link Entity} à partir de la définition
 * (appelera defaults s'il existe, puis construct s'il existe et _.extend sinon)
 * @param {Object=} values Des valeurs à injecter dans l'objet.
 * @return {Entity} Une instance d'entité
 */
EntityDefinition.prototype.create = function(values) {
  var instance = new Entity();
  instance.setDefinition(this);
  if (this._defaults) {
    this._defaults.call(instance);
  }
  if (this._construct) {
    this._construct.call(instance, values);
  } else {
    if (values) _.extend(instance, values);
  }
  return instance;
}

EntityDefinition.prototype.flush = function(cb) {
  var self = this;
  flow()
  .seq(function() { self.entities.database.query('DELETE FROM '+self.table+';', this); })
  .seq(function() { self.entities.database.query('DELETE FROM '+self.table+'_index;', this); })
  .done(cb);
}

/**
 * Retourne un requeteur (sur lequel on pourra chaîner les méthodes de {@link EntityQuery})
 * @param {String=} index Un indexe à matcher en premier.
 * @return {EntityQuery}
 */
EntityDefinition.prototype.match = function() {
  var query = new EntityQuery(this);
  if (arguments.length) query.match.apply(query, Array.prototype.slice.call(arguments));
  return query;
}

/**
 * Ajoute un constructeur (appelé par create avec l'objet qu'on lui donne), s'il n'existe pas
 * le create affectera toutes les valeurs qu'on lui passe à l'entité
 * @param {function} fn Constructeur
 */
EntityDefinition.prototype.construct = function(fn) {
  this._construct = fn;
}

/**
 * Ajoute un initialisateur, qui sera toujours appelé par create (avant un éventuel construct)
 * @param {function} fn La fonction qui initialisera des valeurs par défaut (sera appelée sans arguments)
 */
EntityDefinition.prototype.defaults = function(fn) {
  this._defaults = fn;
}


/**
 * Ajoute un traitement avant stockage.
 * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
 */
EntityDefinition.prototype.beforeStore = function(fn) {
  this._beforeStore = fn;
}

/**
 * Ajoute un traitement après stockage.
 * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
 */
EntityDefinition.prototype.afterStore = function(fn) {
  this._afterStore = fn;
}

/**
 * Callback à rappeler sans argument
 * @callback simpleCallback
 */


module.exports = EntityDefinition;