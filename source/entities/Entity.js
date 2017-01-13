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

  getNextSequence(cb) {
    var self = this;
    flow()
    .seq(function() {
      self.db().collection('counters').findAndModify(
        { _id: self.definition.name },
        [],
        { $inc: { seq: 1 } },
        { upsert: true, new: true }, this);
    })
    .seq(function(seq) {
      cb(null, seq.value.seq);
    })
    .catch(cb);
  }

  buildIndexes() {
    function cast(fieldType, value) {
      switch (fieldType) {
        case 'boolean': return !!value;
        case 'string': return String(value);
        case 'integer': return  Math.round(Number(value));
        case 'date': return Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
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
    return this.definition.entities.connection;
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

    .seq(function() {
      if (!self.oid) {
        self.getNextSequence(this)
      } else {
        this(null, self.oid);
      }
    })

    .seq(function (id) {
      self.oid = id;
      var indexes = self.buildIndexes();
      indexes._id = self.oid;
      indexes._data = JSON.stringify(self, function(k,v) {
        if (_.isFunction(v)) return;
        if (k[0]=='_') return;
        return v;
      });
      self.db().collection(entity.name).save(indexes, { w: 1 }, this);
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
   * Efface cette instance d'entité en base (et ses index) puis appelle callback
   * avec une éventuelle erreur
   * @param {SimpleCallback} callback
   */
  delete(callback) {
    var self = this;
    var entity = this.definition;
    flow()
    .seq(function() {
      if (!self.oid) return this();
      entity.entities.connection.collection(entity.name).remove({_id: self.oid}, this);
    })
    .done(callback)
  }

}


module.exports = Entity;
