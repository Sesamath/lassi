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

'use strict';
var _    = require('lodash');
var flow = require('an-flow');
var ObjectID = require('mongodb').ObjectID;
var log = require('an-log')('$entities');

/**
 * Construction d'une entité. Passez par la méthode {@link Component#entity} pour créer une entité.
 * @constructor
 * @param {Object} settings
 */
class Entity {

  setDefinition(entity) {
    Object.defineProperty(this, 'definition', {value: entity});
  }

  /**
   * Répond true si l'instance de cette Entity n'a jamais été insérée en base de donnée
   * @return {boolean} true si l'instance n'a jamais été sauvegardée
   */
  isNew() {
    return !this.oid;
  }

  buildIndexes() {
    function cast(fieldType, value) {
      switch (fieldType) {
        case 'boolean': return !!value;
        case 'string': return String(value);
        case 'integer': return  Math.round(Number(value));
        // Si la date n'a pas de valeur (undefined ou null, on l'indexe comme null)
        case 'date': return value ? new Date(value) : null;
        default: throw new Error('type d’index ' + fieldType + 'non géré par Entity')
      }
    }
    var entity = this.definition
    var indexes = {};
    for (var field in entity.indexes) {
      var index = entity.indexes[field];
      var values = index.callback.apply(this);
      if (Array.isArray(values)) {
        values = values.map(x => cast(index.fieldType, x));
      } else {
        values = cast(index.fieldType, values);
      }
      indexes[field] = values;
    }
    return indexes;
  }

  db() {
    return this.definition.entities.db;
  }
  /**
   * Stockage d'une instance d'entité.
   * @param {Object=} options non utilisé
   */
  store(options, callback) {
    var self = this;
    var entity = this.definition;

    if (_.isFunction(options)) {
      callback = options;
      options = undefined;
    }
    options = options || {object: true, index: true}
    callback = callback || function() {};

    flow()

    .seq(function () {
      entity._beforeStore.call(self, this);
    })

    .seq(function () {
      if (!self.oid) {
        self.oid = ObjectID().toString();
      }
      var indexes = self.buildIndexes();
      indexes._id = self.oid;
      indexes._data = JSON.stringify(self, function(k,v) {
        if (_.isFunction(v)) return;
        if (k[0]=='_') return;
        return v;
      });
      // @todo save est deprecated, utiliser insertMany ou updateMany
      entity.getCollection().save(indexes, { w: 1 }, this);
    }).seq(function (result) {
      entity._afterStore.call(self, this)
    }).seq(function () {
      callback(null, self)
    }).catch(callback)
  }

  reindex(callback) {
    this.store(callback);
  }

  /**
   * Restore un élément supprimé en soft-delete
   * @param {SimpleCallback} callback
   */
  restore(callback) {
    var self = this;
    var entity = this.definition;

    flow()
    .seq(function() {
      if (!self.oid) return this('Impossible de restorer une entité sans oid');
      entity.entities.db.collection(entity.name).update({
        _id: self.oid
      },{
        $unset: {__deletedAt: ''}
      }, this);
    })
    .seq(function() {
      callback(null, self)
    })
    .catch(callback)
  }

  /**
   * Effectue une suppression "douce" de l'entité
   * @param {SimpleCallback} callback
   * @see restore
   */
  softDelete(callback) {
    var self = this;
    var entity = this.definition;
    flow()
    .seq(function() {
      if (!self.oid) return this();
      entity.entities.db.collection(entity.name).update({
        _id: self.oid
      }, {
        $set: {__deletedAt: new Date() }
      }, this);
    })
    .done(callback)
  }

  /**
   * Efface cette instance d'entité en base (et ses index) puis appelle callback
   * avec une éventuelle erreur
   * @param {SimpleCallback} callback
   */
  delete(callback) {
    var self = this;
    var entity = this.definition;
    flow()
    .seq(function () {
      entity._beforeDelete.call(self, this)
    })
    .seq(function() {
      if (!self.oid) return this();
      entity.getCollection().remove({
        _id: self.oid
      },{w : 1}, this);
    })
    .done(callback)
  }

}


module.exports = Entity;
