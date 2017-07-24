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
var _           = require('lodash');
var Entity      = require('./Entity');
var EntityQuery = require('./EntityQuery');
var flow        = require('an-flow');

function fooCb(cb) { cb(); }

class EntityDefinition {

  /**
   * Construction d'une définition d'entité. Passez par la méthode {@link Component#entity} pour créer une entité.
   * @constructor
   * @param {String} name le nom de l'entité
   */
  constructor(name) {
    this.name = name;
    this.indexes = {};
    this._beforeDelete = this._beforeStore = this._afterStore = fooCb;
    this._textSearchFields = null;
  }

  getCollection() {
    return this.entities.connection.collection(this.name);
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
  defineIndex(fieldName, fieldType, callback) {
    this.indexes[fieldName] = {
      callback: callback?callback:function() { return this[fieldName]; },
      fieldType: fieldType,
      fieldName: fieldName
    };
    return this;
  }

  initialize(cb) {
    this.initializeTextSearchFieldsIndex(cb);
  }

  defineTextSearchFields(fields) {
    var self = this;

    fields.forEach(function(field) {
      if (!self.indexes[field]) {
        throw new Error(`defineTextSearchFields ne s'applique qu'à des index. Non indexé: ${field}`);
      }
    });

    self._textSearchFields = fields;
  }

  initializeTextSearchFieldsIndex(callback) {
    var self = this;

    var dbCollection = self.getCollection();
    var indexName = null;

    if (self._textSearchFields) {
      indexName = 'text_index_' + self._textSearchFields.join('_');
    }


    var findExistingTextIndex = function(cb) {
      dbCollection.listIndexes().toArray(function(err, indexes) {
        if (err) {
          if (err.message === 'no collection') {
            // Ce cas peut se produire si la collection vient d'être créée
            return cb(null, null);
          }
          return cb(err);
        }

        var textIndex = indexes && _.find(indexes, function(index) {
          return !!index.name.match(/^text_index/);
        });

        cb(null, textIndex ? textIndex.name : null);
      })
    }

    var createIndex = function(cb) {
      // Pas de nouvel index à créer
      if (!self._textSearchFields) { return cb(); }

      const indexParams = {};
      self._textSearchFields.forEach(function(field) {
        indexParams[field] = 'text';
      });
      dbCollection.createIndex(indexParams, {name: indexName}, cb)
    }

    flow()
    .seq(function() {
      findExistingTextIndex(this);
    })
    .seq(function(oldTextIndex) {
      var next = this;

      if (indexName === oldTextIndex) {
        // Index déjà créé pour les champs demandés (ou déjà inexistant si null === null), rien d'autre à faire
        return callback();
      }

      if (!oldTextIndex) {
        // Pas d'index à supprimer, on passe à la suite
        return next();
      }

      // Sinon, on supprime l'ancien index pour pouvoir créer le nouveau
      dbCollection.dropIndex(oldTextIndex, this);
    })
    .seq(function() {
      createIndex(this);
    })
    .done(callback);
  }

  /**
   * Finalisation de l'objet Entité.
   * @param {Entities} entities le conteneur d'entités.
   * @return {Entity} l'entité (chaînable)
   * @private
   */
  bless(entities) {
    if (this.configure) this.configure();
    this.entities = entities;
    this.entityClass = this.entityClass || function() {};
    return this;
  }

  /**
   * Retourne une instance {@link Entity} à partir de la définition
   * (appelera defaults s'il existe, puis construct s'il existe et _.extend sinon)
   * @param {Object=} values Des valeurs à injecter dans l'objet.
   * @return {Entity} Une instance d'entité
   */
  create(values) {
    var instance = new Entity();
    instance.setDefinition(this);
    if (this._defaults) {
      this._defaults.call(instance);
    }
    if (this._construct) {
      this._construct.call(instance, values);
      if(values && this._construct.length===0) {
        _.extend(instance, values);
      }
    } else {
      if (values) _.extend(instance, values);
    }
    return instance;
  }

  /**
   * drop la collection
   * @param {simpleCallback} cb
   */
  flush(cb) {
    this.getCollection().drop(cb);
  }

  /**
   * Retourne un requeteur (sur lequel on pourra chaîner les méthodes de {@link EntityQuery})
   * @param {String=} index Un indexe à matcher en premier.
   * @return {EntityQuery}
   */
  match() {
    var query = new EntityQuery(this);
    if (arguments.length) query.match.apply(query, Array.prototype.slice.call(arguments));
    return query;
  }

  textSearch(search, callback) {
    var query = new EntityQuery(this);
    return query.textSearch(search, callback);
  }

  /**
   * Ajoute un constructeur (appelé par create avec l'objet qu'on lui donne), s'il n'existe pas
   * le create affectera toutes les valeurs qu'on lui passe à l'entité
   * @param {function} fn Constructeur
   */
  construct(fn) {
    this._construct = fn;
  }

  /**
   * Ajoute un initialisateur, qui sera toujours appelé par create (avant un éventuel construct)
   * @param {function} fn La fonction qui initialisera des valeurs par défaut (sera appelée sans arguments)
   */
  defaults(fn) {
    this._defaults = fn;
  }


  /**
   * Ajoute un traitement avant stockage.
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  beforeStore(fn) {
    this._beforeStore = fn;
  }

  /**
   * Ajoute un traitement après stockage.
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  afterStore(fn) {
    this._afterStore = fn;
  }

  /**
   * Ajoute un traitement avant suppression
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  beforeDelete(fn) {
    this._beforeDelete = fn;
  }

  /**
   * Callback à rappeler sans argument
   * @callback simpleCallback
   */
}

for (var method in EntityQuery.prototype) {
  if (['match', 'finalizeQuery', 'grab', 'count', 'grabOne', 'sort', 'alterLastMatch', 'textSearch', 'createEntitiesFromRows'].indexOf(method)===-1) {
    EntityDefinition.prototype[method] = (function(method) { return function() {
        var args = Array.prototype.slice.call(arguments);
        var field = args.shift();
        var matcher = this.match(field);
        return matcher[method].apply(matcher, args);
      }
    })(method);
  }
}


module.exports = EntityDefinition;
