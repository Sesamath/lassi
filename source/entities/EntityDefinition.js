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

const _           = require('lodash');
const Entity      = require('./Entity');
const EntityQuery = require('./EntityQuery');
const flow        = require('an-flow');

// pour marquer les index mis par lassi (et ne pas risquer d'en virer des mis par qqun d'autre,
// internes à mongo par ex, genre _id_…)
const indexPrefix = 'entity_index_'

/**
 * Exécute la fonction passée en paramètre (genre de pipe pour une chaîne de callback)
 * @param {function} cb
 * @private
 */
function fooCb (cb) {
  cb();
}

/**
 * @callback simpleCallback
 * @param {Error} [error]
 */
/**
 * Définition d'une entité, avec les méthodes pour la définir
 * mais aussi récupérer sa collection, une EntityQuery, etc.
 */
class EntityDefinition {
  /**
   * Construction d'une définition d'entité. Passez par la méthode {@link Component#entity} pour créer une entité.
   * @constructor
   * @param {String} name le nom de l'entité
   */
  constructor (name) {
    this.name = name;
    this.indexes = {};
    this._beforeDelete = this._beforeStore = this._afterStore = fooCb;
    this._textSearchFields = null;
  }

  /**
   * Retourne l'objet Collection de mongo de cette EntityDefinition
   * @return {Collection}
   */
  getCollection () {
    return this.entities.db.collection(this.name);
  }

  /**
   * Retourne l'objet db de la connexion à Mongo
   * À n'utiliser que dans des cas très particuliers pour utiliser directement des commandes du driver mongo
   * Si lassi ne propose pas la méthode pour votre besoin, il vaudrait mieux l'ajouter à lassi
   * plutôt que d'utiliser directement cet objet, on vous le donne à vos risques et périls…
   * @return {Db}
   */
  getDb () {
    return this.entities.db
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
  defineIndex (fieldName, fieldType, callback) {
    // en toute rigueur il faudrait vérifier que c'est de l'ascii pur,
    // en cas d'accents dans name 127 chars font plus de 128 bytes
    if (fieldName.length > 128 - indexPrefix.length) throw new Error(`Nom d’index trop long, 128 max pour mongo dont ${indexPrefix.length} occupés par notre préfixe`)
    this.indexes[fieldName] = {
      // @FIXME pourquoi créer une callback qui retourne qqchose que personne ne va lire ?
      callback: callback?callback:function() { return this[fieldName]; },
      fieldType: fieldType,
      fieldName: fieldName
    };
    return this;
  }

  initialize (cb) {
    this.initializeIndexes(error => {
      if (error) return cb(error)
      this.initializeTextSearchFieldsIndex(cb);
    });
  }

  initializeIndexes (cb) {
    const def = this
    console.log(`initializeIndexes de ${def.name}`)
    const coll = def.getCollection()
    const existingIndexes = {}
    flow().seq(function () {
      coll.listIndexes().toArray(this)

    // on parse l'existant
    }).seqEach(function (existingIndex) {
      const {name} = existingIndex
      if (RegExp(`/^${indexPrefix}/`).test(name)) {
        if (def.indexes[name]) {
          // la notion de type de valeur à indexer n'existe pas dans mongo.
          // seulement des type d'index champ unique / composé / texte / etc.
          // https://docs.mongodb.com/manual/indexes/#index-types
          console.log(`index ${name} existe`, index)
          existingIndexes[name] = existingIndex
          return this()
        } else {
          // on en veut plus
          console.log(`index ${name} existe dans mongo mais plus dans l'Entity ${def.name}`, index)
          coll.dropIndex(name, this)
        }
      } else {
        console.log(`index existant ${name} ignoré (match pas notre préfixe)`)
        return this()
      }

    }).seq(function () {
      // et on regarde ce qui manque
      // cf https://docs.mongodb.com/manual/reference/command/createIndexes/
      let indexesToAdd = []
      // @todo vérifier la syntaxe
      _.each(def.indexes, (index, name) => {
        if (existingIndexes[name]) return
        indexesToAdd.push({key: {[name]: 1}, name: `${indexPrefix}${name}`})
      })
      coll.createIndexes(indexesToAdd, this)
    }).done(cb)
  }

  defineTextSearchFields (fields) {
    var self = this;

    fields.forEach(function (field) {
      if (!self.indexes[field]) {
        throw new Error(`defineTextSearchFields ne s'applique qu'à des index. Non indexé: ${field}`);
      }
    });

    self._textSearchFields = fields;
  }

  initializeTextSearchFieldsIndex (callback) {
    /**
     * Crée l'index texte pour cette entité
     * @param {simpleCallback} cb
     * @private
     */
    function createIndex (cb) {
      // Pas de nouvel index à créer
      if (!self._textSearchFields) { return cb(); }

      const indexParams = {};
      self._textSearchFields.forEach(function (field) {
        indexParams[field] = 'text';
      });
      dbCollection.createIndex(indexParams, {name: indexName}, cb)
    }

    /**
     * Passe le nom du 1er index texte (normalement le seul)
     * @param {simpleCallback} cb
     */
    function findFirstExistingTextIndex (cb) {
      dbCollection.listIndexes().toArray(function (error, indexes) {
        if (error) {
          // mongo 3.2 ou 3.4…
          if (error.message === 'no collection' || /^Collection.*doesn't exist$/.test(error.message)) {
            // Ce cas peut se produire si la collection vient d'être créée
            return cb(null, null);
          }
          return cb(error);
        }

        // le 1er index dont le nom commence par text_index
        var textIndex = indexes && _.find(indexes, index => /^text_index/.test(index.name));

        cb(null, textIndex ? textIndex.name : null);
      })
    }

    var self = this;

    var dbCollection = self.getCollection();
    var indexName = self._textSearchFields ? 'text_index_' + self._textSearchFields.join('_') : null;

    flow()
    .seq(function () {
      findFirstExistingTextIndex(this);
    })
    .seq(function (oldTextIndex) {
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
    .seq(function () {
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
  bless (entities) {
    if (this.configure) this.configure();
    this.entities = entities;
    this.entityClass = this.entityClass || function () {};
    return this;
  }

  /**
   * Retourne une instance {@link Entity} à partir de la définition
   * (appelera defaults s'il existe, puis construct s'il existe et _.extend sinon)
   * @param {Object=} values Des valeurs à injecter dans l'objet.
   * @return {Entity} Une instance d'entité
   */
  create (values) {
    var instance = new Entity();
    instance.setDefinition(this);
    if (this._defaults) {
      this._defaults.call(instance);
    }
    if (this._construct) {
      this._construct.call(instance, values);
      if (values && this._construct.length === 0) {
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
  flush (cb) {
    // Si la collection n'existe pas, getCollection renvoie quand même un objet
    // mais "MongoError: ns not found" est renvoyé sur le drop
    this.getCollection().drop(function (error) {
      if (error) {
        if (/ns not found/.test(error.message)) return cb()
        return cb(error)
      }
      cb()
    });
  }

  /**
   * Retourne un requeteur (sur lequel on pourra chaîner les méthodes de {@link EntityQuery})
   * @param {String=} index Un index à matcher en premier.
   * @return {EntityQuery}
   */
  match () {
    var query = new EntityQuery(this);
    if (arguments.length) query.match.apply(query, Array.prototype.slice.call(arguments));
    return query;
  }

  /**
   * Ajoute un constructeur (appelé par create avec l'objet qu'on lui donne), s'il n'existe pas
   * le create affectera toutes les valeurs qu'on lui passe à l'entité
   * @param {function} fn Constructeur
   */
  construct (fn) {
    this._construct = fn;
  }

  /**
   * Ajoute un initialisateur, qui sera toujours appelé par create (avant un éventuel construct)
   * @param {function} fn La fonction qui initialisera des valeurs par défaut (sera appelée sans arguments)
   */
  defaults (fn) {
    this._defaults = fn;
  }

  /**
   * Ajoute un traitement avant stockage.
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  beforeStore (fn) {
    this._beforeStore = fn;
  }

  /**
   * Ajoute un traitement après stockage.
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  afterStore (fn) {
    this._afterStore = fn;
  }

  /**
   * Ajoute un traitement avant suppression
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  beforeDelete (fn) {
    this._beforeDelete = fn;
  }

  /**
   * Callback à rappeler sans argument
   * @callback simpleCallback
   */
}

for (var method in EntityQuery.prototype) {
  if (['match', 'finalizeQuery', 'grab', 'count', 'grabOne', 'sort', 'alterLastMatch', 'textSearch', 'createEntitiesFromRows'].indexOf(method) === -1) {
    EntityDefinition.prototype[method] = (function (method) { return function () {
        var args = Array.prototype.slice.call(arguments);
        var field = args.shift();
        var matcher = this.match(field);
        return matcher[method].apply(matcher, args);
      }
    })(method);
  }
}

module.exports = EntityDefinition;
