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

'use strict'

const _ = require('lodash')
const Ajv = require('ajv')
const AjvKeywords = require('ajv-keywords')
const AjvErrors = require('ajv-errors')
const AjvErrorsLocalize = require('ajv-i18n/localize/fr')
const Entity = require('./Entity')
const EntityQuery = require('./EntityQuery')
const {isAllowedIndexType} = require('./internals')
const flow = require('an-flow')
const log = require('an-log')('EntityDefinition')

// pour marquer les index mis par lassi (et ne pas risquer d'en virer des mis par qqun d'autre,
// internes à mongo par ex, genre _id_…)
const INDEX_PREFIX = 'entity_index_'

// ces index sont particuliers, ils ne sont pas construits par Entity::buildIndexes
// mais affectés au store => pas besoin de callback
const BUILT_IN_INDEXES = {
  oid: {
    fieldType: 'string',
    fieldName: '_id',
    useData: false,
    path: '_id',
    indexOptions: {}
  },
  __deletedAt: {
    fieldType: 'date',
    fieldName: '__deletedAt',
    useData: false,
    path: '__deletedAt',
    indexOptions: {}
  }

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
    this.name = name
    this.indexes = {}
    this.indexesByMongoIndexName = {}
    this._textSearchFields = null

    /* Validation */
    this.schema = null
    this._ajv = null
    this._ajvValidate = null
    this._skipValidation = false
    this._toValidateOnChange = {}
    this._trackedAttributes = {}
    this._toValidate = []
  }

  _validateEntityWithSchema (entity, cb) {
    if (!this._ajvValidate) return cb()

    this._ajvValidate(entity.values())
      .then((data) => cb(null, data))
      .catch((err) => {
        // Traduit les messages d'erreur en français
        AjvErrorsLocalize(err.errors)

        // On enlève les erreurs de certains mots clés qui ne nous interéssent pas particulièrement
        err.errors = err.errors.filter((error) => error.keyword !== 'if')

        // On modifie quelques erreurs pour les rendres plus lisibles
        err.errors = err.errors.map((error) => {
          if (error.keyword === 'additionalProperties') {
            return Object.assign({}, error, {
              message: `${error.message} : "${error.params.additionalProperty}"`
            })
          }
          return error
        })

        // Génère un message d'erreur qui aggrège les erreurs de validations
        err.message = this._ajv.errorsText(err.errors, {dataVar: this.name})

        cb(err)
      })
  }

  validate (validateFn) {
    this._toValidate.push(validateFn)
  }

  validateOnChange (attributeName, validateFn, skipDeleted = true) {
    if (_.isArray(attributeName)) {
      attributeName.forEach((att) => this.validateOnChange(att, validateFn))
      return
    }
    if (!this._toValidateOnChange[attributeName]) {
      this._toValidateOnChange[attributeName] = []
    }
    this._toValidateOnChange[attributeName].push(validateFn)
    this.trackAttribute(attributeName)
  }

  // On suite la valeur de l'attribut, pour voir le changement entre le chargement depuis la base et le store
  trackAttributes (attributeName) {
    attributeName.forEach((att) => this.trackAttribute(attributeName))
  }

  trackAttribute (attributeName) {
    this._trackedAttributes[attributeName] = true
  }
  /**
   * Définit un json schema pour l'entity, validé lors d'un appel à isValid() ou avant le store d'une entity
   * Le deuxième argument permet d'ajouter des keywords personnalisés
   *
   * @param {Object} schema json schema à valider
   * @param {Object} addKeywords "keywords" supplémentaires à définir sur ajv, cf. https://github.com/epoberezkin/ajv#api-addkeyword
   */
  validateJsonSchema (schema, addKeywords = {}) {
    if (this.schema) throw new Error(`validateJsonSchema a déjà été appelé pour l'entity ${this.name}`)

    this._ajv = new Ajv({allErrors: true, jsonPointers: true})
    // Ajv options allErrors and jsonPointers are required for AjxErrors
    AjvErrors(this._ajv)
    AjvKeywords(this._ajv, 'instanceof')

    _.forEach(addKeywords, (definition, keyword) => {
      this._ajv.addKeyword(keyword, definition)
    })

    this.schema = Object.assign(
      {
        $async: true, // pour avoir une validation uniforme, on considère tous les schémas asynchrones
        additionalProperties: false, // par défaut, on n'autorise pas les champs non-déclarés dans les properties
        type: 'object', // toutes les entities sont des objets
        title: this.name
      },
      schema
    )

    this._ajvValidate = this._ajv.compile(this.schema)
  }

  /**
   * @param {Boolean} skipValidation si true, on ne vérifie pas la validation avant le store
   */
  setSkipValidation (skipValidation) {
    this._skipValidation = skipValidation
  }
  /**
   * Retourne l'objet Collection de mongo de cette EntityDefinition
   * @return {Collection}
   */
  getCollection () {
    return this.entities.db.collection(this.name)
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
   * Retourne la définition de l'index demandé
   * @param {string} indexName
   * @throws {Error} si index n'est pas un index défini
   */
  getIndex (indexName) {
    if (BUILT_IN_INDEXES[indexName]) return BUILT_IN_INDEXES[indexName]

    if (!this.hasIndex(indexName)) throw new Error(`L’entity ${this.name} n’a pas d’index ${indexName}`)
    return this.indexes[indexName]
  }

  /**
   * Retourne le nom de l'index mongo associé à un champ
   * @param fieldName
   * @return {string}
   */
  getMongoIndexName (path, useData, indexOptions = {}) {
    let name = `${INDEX_PREFIX}${path}`

    if (useData) {
      // quand un index passe de calculé à non calculé, on veut le regéner donc on change son nom
      name = `${name}-data`
    }

    // On donne un nom différent à un index unique et/ou sparse ce qui force lassi à recréer l'index
    // si on ajoute ou enlève l'option
    ;['unique', 'sparse'].forEach((opt) => {
      if (indexOptions[opt]) name = `${name}-${opt}`
    })

    return name
  }

  /**
   * Pour savoir si un index est défini
   * @param indexName
   * @return {boolean}
   */
  hasIndex (indexName) {
    return !!this.indexes[indexName]
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
   * @param {String} indexName Nom du champ à indexer ou de l'index virtuel
   * @param {String} fieldType (optionnel) Type du champ à indexer ('integer', 'string', 'date')
   *                                      ce qui va entrainer du cast à l'indexation et à la query (cf. castToType)
   * @param {Object} indexOptions (optionnel) Options d'index mongo ex: {unique: true, sparse: true}
   * @param {Function} callback (optionnel) Cette fonction permet de définir virtuellement la valeur d'un index.
   * @return {Entity} l'entité (chaînable)
   */
  defineIndex (fieldName, ...params) {
    let callback
    let indexOptions = {}
    let fieldType
    // On récupère les paramètres optionnels: fieldType, indexOptions, callback
    // en partant de la fin. Heureusement ils ont des types différents!
    let param = params.pop()
    if (typeof param === 'function') {
      callback = param
      param = params.pop()
    }

    if (typeof param === 'object') {
      indexOptions = param
      param = params.pop()
    }

    if (typeof param === 'string') {
      fieldType = param
      if (!isAllowedIndexType(fieldType)) throw new Error(`Type d’index ${fieldType} non géré`)
    }

    // Pour l'instant le seul cas où on peut se permettre d'indexer directement l'attribute dans _data
    // est le cas où ces conditions sont remplies :
    // - l'index n'est pas sparse, car buildIndexes() opére une transformation sur les null/undefined
    // - l'index n'a pas de fieldType car buildIndexes() et buildQuery() font du cast sur la valeur indexer
    // TODO: peut-être se débarrasser de fieldType, mais vu ce que l'on fait dans castToType, ça peut
    //       avoir des répercutions
    const useData = !callback && !indexOptions.sparse && !fieldType

    const mongoIndexName = this.getMongoIndexName(fieldName, useData, indexOptions)
    // en toute rigueur il faudrait vérifier que c'est de l'ascii pur,
    // en cas d'accents dans name 127 chars font plus de 128 bytes
    if (mongoIndexName > 128) throw new Error(`Nom d’index trop long, 128 max pour mongo dont ${INDEX_PREFIX.length} occupés par notre préfixe`)

    const index = {
      fieldType,
      fieldName,
      useData,
      path: useData ? `_data.${fieldName}` : fieldName,
      mongoIndexName,
      indexOptions,
      // Si on nous passe pas de callback, on retourne la valeur du champ
      // attention, pas de fat arrow ici car on fera du apply dessus
      callback: callback || function () { return this[fieldName] }
    }

    this.indexes[fieldName] = index
    this.indexesByMongoIndexName[mongoIndexName] = index
    return this
  }

  defineMethod (name, fn) {
    this.entityConstructor.prototype[name] = fn
  }

  initialize (cb) {
    log(this.name, 'initialize')
    this.initializeIndexes(error => {
      if (error) return cb(error)
      this.initializeTextSearchFieldsIndex(cb)
    })
  }

  /**
   * @callback indexesCallback
   * @param {Error} [error]
   * @param {Object[]} [createdIndexes] tableau d'index mongo (retourné par listIndexes ou createIndexes)
   */
  /**
   * Récupère tous les index existants
   * @param {indexesCallback} cb
   */
  getMongoIndexes (cb) {
    this.getCollection().listIndexes().toArray(function (error, indexes) {
      if (error) {
        // mongo 3.2 ou 3.4…il semblerait que les message ne soient pas uniformes
        if (
          error.message === 'no collection' ||
          error.message === 'no database' ||
          /^Collection.*doesn't exist$/.test(error.message) ||
          /^Database.*doesn't exist$/.test(error.message)
        ) {
          // Ce cas peut se produire si la collection/database vient d'être créée
          // il n'y a donc pas d'index existant
          return cb(null, [])
        }
        return cb(error)
      }

      return cb(null, indexes)
    })
  }

  /**
   * Init des indexes
   * - virent ceux qu'on avait mis et qui ont disparu de l'entity
   * - ajoute ceux qui manquent
   * @param {indexesCallback} cb rappelée avec (error, createdIndexes), le 2e argument est undefined si on a rien créé
   */
  initializeIndexes (cb) {
    const def = this
    const coll = def.getCollection()
    const existingIndexes = {}
    flow().seq(function () {
      def.getMongoIndexes(this)
    // on parse l'existant
    }).seqEach(function (existingIndex) {
      const mongoIndexName = existingIndex.name
      // _id_ est un index mis d'office par mongo
      if (mongoIndexName === '_id_') return this()

      if (def.indexesByMongoIndexName[mongoIndexName]) {
        // la notion de type de valeur à indexer n'existe pas dans mongo.
        // seulement des type d'index champ unique / composé / texte / etc.
        // https://docs.mongodb.com/manual/indexes/#index-types
        // ici on boucle sur les index ordinaire, faudrait vérifier que c'est pas un composé ou un unique,
        // mais vu qu'il a un nom à nous… il a été mis par nous avec ce même code donc pas la peine de trop creuser.
        // faudra le faire si on ajoute les index composés et qu'on utilise def.indexes aussi pour eux
        existingIndexes[mongoIndexName] = existingIndex
        log(def.name, `index ${mongoIndexName} ok`)
        return this()
      }
      // si on est toujours là c'est un index qui n'est plus défini,
      // on met un message différent suivant que c'est un index lassi ou pas
      if (RegExp(`^${INDEX_PREFIX}`).test(mongoIndexName)) {
        log(def.name, `index ${mongoIndexName} existe dans mongo mais plus dans l'Entity => DROP`, existingIndex)
      } else {
        log(def.name, `index ${mongoIndexName} existe dans mongo mais n’est pas un index lassi => DROP`, existingIndex)
      }
      // on le vire
      coll.dropIndex(mongoIndexName, this)
    }).seq(function () {
      // et on regarde ce qui manque
      let indexesToAdd = []
      _.forEach(def.indexes, ({path, mongoIndexName, indexOptions}) => {
        if (existingIndexes[mongoIndexName]) return
        // directement au format attendu par mongo
        // cf https://docs.mongodb.com/manual/reference/command/createIndexes/
        indexesToAdd.push({key: {[path]: 1}, name: mongoIndexName, ...indexOptions})
        log(def.name, `index ${mongoIndexName} n’existait pas => à créer`)
      })

      if (indexesToAdd.length) coll.createIndexes(indexesToAdd, cb)
      else cb()
    }).catch(cb)
  }

  defineTextSearchFields (fields) {
    var self = this

    self._textSearchFields = fields.map(this.getIndex.bind(this))
  }

  initializeTextSearchFieldsIndex (callback) {
    /**
     * Crée l'index texte pour cette entité
     * @param {simpleCallback} cb
     * @private
     */
    function createIndex (cb) {
      // Pas de nouvel index à créer
      if (!self._textSearchFields) { return cb() }

      const indexParams = {}
      self._textSearchFields.forEach(function ({path}) {
        indexParams[path] = 'text'
      })
      dbCollection.createIndex(indexParams, {name: indexName}, cb)
    }

    /**
     * Passe le nom du 1er index texte (normalement le seul)
     * @param {simpleCallback} cb
     */
    function findFirstExistingTextIndex (cb) {
      self.getMongoIndexes(function (error, indexes) {
        if (error) return cb(error)
        // le 1er index dont le nom commence par text_index
        var textIndex = indexes && _.find(indexes, index => /^text_index/.test(index.name))

        cb(null, textIndex ? textIndex.name : null)
      })
    }

    var self = this

    var dbCollection = self.getCollection()
    var indexName = self._textSearchFields ? 'text_index_' + self._textSearchFields.join('_') : null

    flow()
      .seq(function () {
        findFirstExistingTextIndex(this)
      })
      .seq(function (oldTextIndex) {
        var next = this

        if (indexName === oldTextIndex) {
        // Index déjà créé pour les champs demandés (ou déjà inexistant si null === null), rien d'autre à faire
          return callback()
        }

        if (!oldTextIndex) {
        // Pas d'index à supprimer, on passe à la suite
          return next()
        }

        // Sinon, on supprime l'ancien index pour pouvoir créer le nouveau
        dbCollection.dropIndex(oldTextIndex, this)
      })
      .seq(function () {
        createIndex(this)
      })
      .done(callback)
  }

  /**
   * Finalisation de l'objet Entité, appelé en fin de définition, avant initialize
   * @param {Entities} entities le conteneur d'entités.
   * @return {Entity} l'entité (chaînable)
   * @private
   */
  bless (entities) {
    if (this.configure) this.configure()
    this.entities = entities
    if (!this.entityConstructor) {
      this.entityConstructor = function () {
        // Théoriquement il aurait fallut appeler le constructeur d'Entity avec Entity.call(this, ...), mais
        // 1. c'est impossible car Entity est une classe, qu'il faut instancier avec 'new'
        // 2. Entity n'a pas de constructeur, donc ça ne change pas grand chose
      }
      this.entityConstructor.prototype = Object.create(Entity.prototype)
    }
    return this
  }

  /**
   * Retourne une instance {@link Entity} à partir de la définition
   * (appelera defaults s'il existe, puis construct s'il existe et Object.assign sinon)
   * Attention, si la fonction passée à construct n'attend pas d'argument,
   * toutes les propriétés de values seront affectée à l'entité !
   * @todo virer ce comportement et ajouter dans les constructeurs qui l'utilisaient un `Object.assign(this, values)`
   * @param {Object=} values Des valeurs à injecter dans l'objet.
   * @return {Entity} Une instance d'entité
   */
  create (values) {
    var instance = new this.entityConstructor() // eslint-disable-line new-cap
    instance.setDefinition(this)
    if (this._defaults) {
      this._defaults.call(instance)
    }
    if (this._construct) {
      this._construct.call(instance, values)
      // Si la fonction passée en constructeur ne prend aucun argument,
      // on ajoute d'office les values passées au create dans l'entity
      // (si le constructeur ne les a pas créées)
      if (values && this._construct.length === 0) {
        Object.assign(instance, values)
      }
    } else {
      if (values) Object.assign(instance, values)
    }

    if (!instance.isNew()) {
      instance.onLoad()
    }

    return instance
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
    })
  }

  /**
   * Retourne un requeteur (sur lequel on pourra chaîner les méthodes de {@link EntityQuery})
   * @param {String=} index Un index à matcher en premier.
   * @return {EntityQuery}
   */
  match () {
    var query = new EntityQuery(this)
    if (arguments.length) query.match.apply(query, Array.prototype.slice.call(arguments))
    return query
  }

  /**
   * Ajoute un constructeur (appelé par create avec l'objet qu'on lui donne), s'il n'existe pas
   * le create affectera toutes les valeurs qu'on lui passe à l'entité
   * @param {function} fn Constructeur
   */
  construct (fn) {
    this._construct = fn
  }

  /**
   * Ajoute un initialisateur, qui sera toujours appelé par create (avant un éventuel construct)
   * @param {function} fn La fonction qui initialisera des valeurs par défaut (sera appelée sans arguments)
   */
  defaults (fn) {
    this._defaults = fn
  }

  /**
   * Ajoute un traitement avant stockage.
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  beforeStore (fn) {
    this._beforeStore = fn
  }

  /**
   * Ajoute un traitement après stockage.
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  afterStore (fn) {
    this._afterStore = fn
  }

  /**
   * Ajoute un traitement après récupération de l'entité en base de donnée
   *
   * ATTENTION: cette fonction sera appelée très souvent (pour chaque entity retournée) et doit se limiter
   *            à des traitements très simples.
   *            Contrairent aux autres before* ou after*, elle ne prend pas de callback pour le moment car dangereux
   *            en terme de performance - on ne veut pas d'appel asynchrone sur ce genre de fonction - et plus compliqué
   *            à implémenter ici.
   *            Par exemple, sur une entité utilisateur:
   *
   *            this.onLoad(function {
   *                this.$dbPassword = this.password // permettra de voir plus tard si le password a été changé
   *            })
   *
   * @param {simpleCallback} fn fonction à exécuter qui ne prend pas de paramètre
   */
  onLoad (fn) {
    this._onLoad = fn
  }

  /**
   * Ajoute un traitement avant suppression
   * @param {simpleCallback} fn fonction à exécuter qui doit avoir une callback en paramètre (qui n'aura pas d'arguments)
   */
  beforeDelete (fn) {
    this._beforeDelete = fn
  }

  /**
   * Callback à rappeler sans argument
   * @callback simpleCallback
   */
}

for (var method in EntityQuery.prototype) {
  if (['match', 'finalizeQuery', 'grab', 'count', 'countBy', 'grabOne', 'sort', 'alterLastMatch', 'textSearch', 'createEntitiesFromRows'].indexOf(method) === -1) {
    EntityDefinition.prototype[method] = (function (method) {
      return function () {
        var args = Array.prototype.slice.call(arguments)
        var field = args.shift()
        var matcher = this.match(field)
        return matcher[method].apply(matcher, args)
      }
    })(method)
  }
}

module.exports = EntityDefinition
