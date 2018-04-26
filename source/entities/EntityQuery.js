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

const log = require('an-log')('EntityQuery')
const _ = require('lodash')
const flow = require('an-flow')
const ProgressBar = require('progress')
const {castToType} = require('./internals')

// une limite hard pour grab
const HARD_LIMIT_GRAB = 1000
const FOREACH_BATCH_SIZE = 200

/**
 * Retourne le "matcher" en cours
 * @param {Object} entityQuery
 * @private
 */
function lastMatch (entityQuery) {
  return _.last(entityQuery.clauses)
}

/**
 * Helper permettant d'altérer la dernière clause.
 * @param {Object} entityQuery
 * @param {Object} data les données à injecter.
 * @return {EntityQuery} La requête (pour chaînage)
 * @private
 */
function alterLastMatch (entityQuery, data) {
  Object.assign(lastMatch(entityQuery), data)
  return entityQuery
}
/**
 * Applique les clauses pendantes à la requête courante
 * @param {EntityQuery} entityQuery
 * @param {EntityQuery~record} record
 * @private
 */
function buildQuery (entityQuery, record) {
  var query = record.query

  entityQuery.clauses.forEach((clause) => {
    if (!clause) throw new Error('Erreur interne, requête invalide')
    const {fieldName, fieldType} = clause.index

    if (clause.type === 'sort') {
      record.options.sort = record.options.sort || []
      record.options.sort.push([fieldName, clause.order])
      return
    }

    if (clause.type !== 'match') return

    const cast = x => castToType(x, fieldType)

    if (!clause.operator) return

    var condition
    switch (clause.operator) {
      case '=':
        condition = {$eq: cast(clause.value)}
        break

      case '<>':
        condition = {$ne: cast(clause.value)}
        break

      case '>':
        condition = {$gt: cast(clause.value)}
        break

      case '<':
        condition = {$lt: cast(clause.value)}
        break

      case '>=':
        condition = {$gte: cast(clause.value)}
        break

      case '<=':
        condition = {$lte: cast(clause.value)}
        break

      case 'BETWEEN':
        condition = {$gte: cast(clause.value[0]), $lte: cast(clause.value[1])}
        break

      case 'LIKE':
        condition = {$regex: new RegExp(cast(clause.value).replace(/%/g, '.*'))}
        break

      case 'ISNULL':
        condition = {$eq: null}
        break

      case 'ISNOTNULL':
        condition = {$ne: null}
        break

      case 'NOT IN':
        condition = {$nin: clause.value.map(cast)}
        break

      case 'IN':
        condition = {$in: clause.value.map(cast)}
        break

      default:
        log.error(new Error(`operator ${clause.operator} unknown`))
    }

    // On ajoute la condition
    if (!query[fieldName]) query[fieldName] = {}
    Object.assign(query[fieldName], condition)
  })

  // par défaut on prend pas les softDeleted
  if (!query['__deletedAt'] && !entityQuery._includeDeleted) query['__deletedAt'] = {$eq: null}
  if (entityQuery.debug) log('mongoQuery', record)
} // buildQuery

/**
 * Vérifie que value n'est pas falsy (sauf qui est 0 accepté)
 * @private
 * @param value
 */
function checkCompareValue (value) {
  // le seul falsy qui est valable pour une comparaison
  if (value === 0) return
  // Et en attendant plus précis, on refuse tous les autres falsy
  if (!value) throw new Error('paramètre de requête invalide')
}

/**
 * Vérifie que value n'est pas falsy
 * @private
 * @param value
 */
function checkDate (value) {
  // on accepte tout sauf falsy
  if (!value) throw new Error('paramètre de requête invalide (date voulue)')
}

/**
 * Vérifie que value est un array
 * @private
 * @param value
 * @throws si value invalide
 */
function checkIsArray (value) {
  if (!Array.isArray(value)) throw new Error('paramètre de requête invalide (Array obligatoire)')
}

/**
 * Retourne un tableau d'entities à partir d'un array de documents mongo
 * @private
 * @param {EntityQuery} entityQuery
 * @param {Array} rows
 * @return {Entity[]}
 * @throws Si _data n'est pas du json valide
 */
function createEntitiesFromRows (entityQuery, rows) {
  // on veut des objets date à partir de strings qui matchent ce pattern de date.toString()
  const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
  const jsonReviver = (key, value) => (typeof value === 'string' && dateRegExp.test(value) && new Date(value)) || value

  return rows.map((row) => {
    let data
    if (row._data) {
      try {
        data = JSON.parse(row._data, jsonReviver)
      } catch (error) {
        console.error(error, `avec les _data :\n${row._data}`)
        // on renvoie un message plus compréhensible
        throw new Error(`Données corrompues pour ${entityQuery.entity.name}/${row._id}`)
      }
    } else {
      throw new Error(`Données corrompues pour ${entityQuery.entity.name}/${row._id}`)
    }
    data.oid = row._id.toString()
    // __deletedAt n'est pas une propriété de _data, c'est un index ajouté seulement quand il existe (par softDelete)
    if (row.__deletedAt) {
      data.__deletedAt = row.__deletedAt
    }

    return entityQuery.entity.create(data)
  })
}

/**
 * @typedef EntityQuery~record
 * @property {EntityQuery~query} query
 * @property {number} limit toujours fourni, HARD_LIMIT_GRAB par défaut
 * @property {object} options sera passé tel quel à mongo
 * @property {number} options.skip Offset pour un find
 */
/**
 * Prépare la requête pour un find ou un delete (helper de grab ou purge)
 * @private
 * @param {EntityQuery} entityQuery
 * @param {object} options
 */
function prepareRecord (entityQuery, options) {
  if (options) { // null est de type object…
    if (typeof options === 'number') {
      options = {limit: options}
    } else if (typeof options !== 'object') {
      log.error(new Error('options invalides'), options)
      options = {}
    }
  } else {
    options = {}
  }
  const record = {query: {}, options: {}, limit: HARD_LIMIT_GRAB}
  // on accepte offset ou skip
  const skip = options.offset || options.skip
  if (skip > 0) record.options.skip = skip
  // set limit
  if (options.limit) {
    if (options.limit > 0 && options.limit <= HARD_LIMIT_GRAB) {
      record.limit = options.limit
    } else {
      log.error(`limit ${options.limit} trop élevée, ramenée au max admis ${HARD_LIMIT_GRAB} (HARD_LIMIT_GRAB)`)
    }
  }

  buildQuery(entityQuery, record)
  return record
}

/**
 * Requête sur une entity, les méthodes sont chaînables,
 * sauf celles qui renvoient des résultats à une callback
 * (grab, grabOne, count, countBy, purge)
 */
class EntityQuery {
  /**
   * Construction d'une requête sur entité.
   * Ce constructeur ne doit jamais être appelé directement,
   * utilisez {@link EntityDefinition#match}
   * @constructor
   * @param {EntityDefinition} entityDefinition La définition de l'entité
   */
  constructor (entityDefinition) {
    /**
     * La définition de l'entité
     * @type {EntityDefinition}
     */
    this.entity = entityDefinition
    this.clauses = []
    this.search = null
    this._includeDeleted = false
  }

  /**
   * Racourci vers Entity#getIndex
   * @param {String} indexName
   */
  getIndex (indexName) {
    return this.entity.getIndex(indexName)
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index supérieure à une date donnée
   * @alias greaterThan
   * @param {Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  after (value) {
    checkDate(value)
    return alterLastMatch(this, {value: value, operator: '>'})
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est inférieure à une date donnée
   * @alias lowerThan
   * @param {Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  before (value) {
    checkDate(value)
    return alterLastMatch(this, {value: value, operator: '<'})
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est comprise
   * entre deux valeurs.
   *
   * @param {String|Integer|Date} from La valeur de la borne inférieure
   * @param {String|Integer|Date} to La valeur de la borne supérieure
   * @return {EntityQuery} La requête (pour chaînage)
   */
  between (from, to) {
    checkDate(from)
    checkDate(to)
    return alterLastMatch(this, {value: [from, to], operator: 'BETWEEN'})
  }

  /**
   * Callback de count
   * @callback EntityQuery~CountCallback
   * @param {Error} error Une erreur est survenue.
   * @param {Integer} count le nb de résultat
   */
  /**
   * Compte le nombre d'objet correpondants.
   * @param {EntityQuery~CountCallback} callback
   */
  count (callback) {
    var self = this
    var record = {query: {}, options: {}}

    flow()
      .seq(function () {
        buildQuery(self, record)
        self.entity.getCollection().count(record.query, record.options, this)
      })
      .done(callback)
  }

  /**
   * Callback de countBy
   * @callback EntityQuery~CountByCallback
   * @param {Error} error Une erreur est survenue (l'index n'existait pas)
   * @param {object} result le nb de résultats par valeur de l'index
   */
  /**
   * Compte le nombre d'objet correpondants et les regroupes par index.
   * @param {String} index L'index dont on veut le nb d'entities pour chaque valeur qu'il prend
   * @param {EntityQuery~CountByCallback} callback
   */
  countBy (index, callback) {
    const {fieldName} = this.getIndex(index)

    var self = this
    var record = {query: {}, options: {}}

    flow()
      .seq(function () {
        buildQuery(self, record)
        const query = [
          {$match: record.query},
          {$group: {_id: `$${fieldName}`, count: {$sum: 1}}}
        ]
        self.entity.getCollection().aggregate(query, this)
      })
      .seq(function (_groupes) {
        const groupes = {}
        _.forEach(_groupes, (groupe) => {
          groupes[groupe._id] = groupe.count
        })
        callback(null, groupes)
      })
      .catch(callback)
  }

  /**
   * Ajoute (ou enlève) le mode debug qui log les params de la requête
   * (qui peuvent être passé tels quels dans un mongo-shell)
   * @param {boolean} [status=true]
   * @return {EntityQuery} La requête (pour chaînage)
   */
  setDebug (status = true) {
    this.debug = status
    return this
  }

  /**
   * Remonte les entités softDeleted après when
   * @param {Date} when
   * @return {EntityQuery} La requête (pour chaînage)
   */
  deletedAfter (when) {
    checkDate(when)
    this.clauses.push({type: 'match', index: this.getIndex('__deletedAt'), operator: '>', value: when})
    return this
  }

  /**
   * Remonte les entités softDeleted avant when (<=)
   * @param {Date} when
   * @return {EntityQuery} La requête (pour chaînage)
   */
  deletedBefore (when) {
    checkDate(when)
    this.clauses.push({type: 'match', index: this.getIndex('__deletedAt'), operator: '<', value: when})
    return this
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est égale à une
   * valeur donnée.
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (pour chaînage)
   */
  equals (value, fieldValue) {
    if (typeof fieldValue !== 'undefined') {
      this.match(value)
      value = fieldValue
    }
    return alterLastMatch(this, {value: value, operator: '='})
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est fausse.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  false () {
    return this.equals(false)
  }

  /**
   * Callback d'exécution d'une requête grab
   * @callback EntityQuery~GrabCallback
   * @param {Error} error
   * @param {Array} entities La liste des entités remontées
   */
  /**
   * Récupère des entités
   * @param {number|object}           [options]      Si seulement un nombre est fourni, il sera traité comme options.limit
   * @param {number}                   options.limit Entier >0 et < 1000
   * @param {number}                   options.skip  Entier >0, pour démarrer avec un offset
   * @param {EntityQuery~GrabCallback} callback rappelée avec l'erreur ou les résultats
   */
  grab (options, callback) {
    if (_.isFunction(options)) {
      callback = options
      options = {}
    }
    const record = prepareRecord(this, options)
    let query

    if (this.search) {
      let sorts = {}
      _.forEach(record.options.sort, (sort) => {
        sorts[sort[0]] = sort[1] === 'asc' ? 1 : -1
      })
      // Le sort sur le score doit être fait avant les sorts "classiques"
      let recordSort = _.merge({score: {$meta: 'textScore'}}, sorts)
      delete record.options.sort

      let recordQuery = _.merge(record.query, {$text: {$search: this.search}})
      let recordOptions = _.merge(record.options, {score: {$meta: 'textScore'}})

      query = this.entity.getCollection()
        .find(recordQuery, recordOptions)
        .sort(recordSort)
    } else {
      query = this.entity.getCollection()
        .find(record.query, record.options)
    }

    query.limit(record.limit)
      .toArray((error, rows) => {
        if (error) return callback(error)
        // on râle si on atteint la limite, sauf si on avait demandé cette limite
        if (rows.length === HARD_LIMIT_GRAB && options.limit !== HARD_LIMIT_GRAB) log.error('HARD_LIMIT_GRAB atteint avec', record)
        try {
          callback(null, createEntitiesFromRows(this, rows))
        } catch (error) {
          callback(error)
        }
      })
  }

  /**
   * Callback d'exécution d'une requête grabOne
   * @callback EntityQuery~GrabOneCallback
   * @param {Error} error Une erreur est survenue.
   * @param {Entity} entites L'objet trouvé (ou null)
   */
  /**
   * Renvoie un objet liés à la requête
   * @param {EntityQuery~GrabOneCallback} callback La callback.
   */
  grabOne (callback) {
    this.grab({limit: 1}, function (error, entities) {
      if (error) return callback(error)
      if (entities.length === 0) return callback()
      callback(null, entities[0])
    })
  }
  /**
   * Callback d'exécution d'une requête forEach, appelé sur chaque résultat de la requête
   * @callback EntityQuery~ForEachOnEachEntityCallback
   * @param {Entity} entity Un des résultats de la requête
   * @param {function} next Callback a appeler quand ce résultat est traité
   */
  /**
   * Callback final d'une requête forEach, appelé quand tous les résultats ont été traités
   * @callback EntityQuery~ForEachDoneCallback
   * @param {Error} error Une erreur est survenue.
   * @param {number} count Nombre total d'entités traitées
   */
  /**
   * Applique un traitement (onEachEntity) sur chaque entité correspondant à la EntityQuery en cours
   * Si une occurence lève une erreur, l'ensemble de la boucle est arrétée.
   * @param {EntityQuery~ForEachOnEachEntityCallback} onEachEntity appelée avec (entity, next), next devra être rappelé après traitement avec une erreur éventuelle
   * @param {EntityQuery~ForEachDoneCallback} done appelée à la fin avec (error, nbProcessedOk)
   * @param {object} [options]
   * @param {number} [options.limit] Le max du nb d'entity à traiter
   * @param {boolean} [options.progressBar] Passer true pour afficher la progression en console (donc si l'on a un tty, i.e. en cli sans redirection de stdout)
   */
  forEach (onEachEntity, done, options = {}) {
    const query = this
    const globalLimit = options.limit

    let skip = 0
    // le nb d'entités traitées sans erreur
    let nb = 0

    let progressBar

    const nextBatch = () => {
      if (globalLimit && globalLimit <= skip) return done(null, nb)
      const limit = globalLimit ? Math.min(FOREACH_BATCH_SIZE, globalLimit - skip) : FOREACH_BATCH_SIZE

      query.grab({limit, skip}, (err, entities) => {
        if (err) return done(err, nb)

        // On capture la taille de 'entities' avant de le modifier plus bas
        const entitiesLength = entities.length
        const doneBatch = () => {
          if (entitiesLength < FOREACH_BATCH_SIZE) {
            done(null, nb)
          } else {
            skip += FOREACH_BATCH_SIZE
            process.nextTick(nextBatch)
          }
        }

        const processNextEntity = () => {
          // On traite les entités au début du tableau jusqu'à ce qu'il soit vide
          if (entities.length) {
            try { // si 'onEachEntity' throw une erreur
              let called = false
              onEachEntity(entities.shift(), (err) => {
                if (called) return done(new Error('ERROR: forEachEntity onEntity callback function called many times'), nb)
                called = true
                if (err) return done(err, nb)
                nb++
                processNextEntity()
              })
            } catch (e) {
              return done(e, nb)
            }
          } else {
            if (progressBar) progressBar.tick(entitiesLength)
            doneBatch()
          }
        }

        processNextEntity()
      })
    }

    query.count((err, count) => {
      if (err) return done(err)
      if (options.progressBar) {
        const format = 'progress: :percent [:bar] :current/:total (~:etas left)'
        const options = {
          total: globalLimit ? Math.min(count, globalLimit) : count
        }
        progressBar = new ProgressBar(format, options)
      }

      // Start batching
      nextBatch()
    })
  }
  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est supérieure à une
   * valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  greaterThan (value) {
    checkCompareValue(value)
    return alterLastMatch(this, {value: value, operator: '>'})
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est supérieure ou
   * égale à une valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  greaterThanOrEquals (value) {
    checkCompareValue(value)
    return alterLastMatch(this, {value: value, operator: '>='})
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est dans une liste
   *
   * @param {String[]|Integer[]|Date[]} value Les valeurs à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  in (values) {
    checkIsArray(values)
    // cette vérif est souvent oubliée avant l'appel, on throw plus pour ça mais faudrait toujours le tester avant l'appel
    if (!values.length) console.error(new Error('paramètre de requête invalide (in veut un Array non vide)'), 'appelé avec :\n', this.clauses)
    return alterLastMatch(this, {value: values, operator: 'IN'})
  }

  /**
   * Remonte toutes les entités, softdeleted ou non
   * @return {EntityQuery} La requête (pour chaînage)
   */
  includeDeleted () {
    this._includeDeleted = true
    return this
  }

  /**
   * Limite aux entities ayant l'index précédent non null
   * @return {EntityQuery} La requête (pour chaînage)
   */
  isNotNull () {
    return alterLastMatch(this, {operator: 'ISNOTNULL'})
  }

  /**
   * Limite aux entities ayant l'index précédent null (ou undefined)
   * @return {EntityQuery} La requête (pour chaînage)
   */
  isNull () {
    if (lastMatch(this).index.indexOptions.sparse) {
      throw new Error('isNull() ne peut pas être appelé sur un index sparse')
    }
    return alterLastMatch(this, {operator: 'ISNULL'})
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) ressemble à une
   * valeur donnée (Cf signification du _ et % avec like).
   * @see https://dev.mysql.com/doc/refman/5.5/en/pattern-matching.html
   *
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (pour chaînage)
   */
  like (value) {
    checkCompareValue(value)
    return alterLastMatch(this, {value: value, operator: 'LIKE'})
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est inférieure à une
   * valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  lowerThan (value) {
    checkCompareValue(value)
    return alterLastMatch(this, {value: value, operator: '<'})
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est inférieure ou
   * égale à une valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  lowerThanOrEquals (value) {
    checkCompareValue(value)
    return alterLastMatch(this, {value: value, operator: '<='})
  }

  /**
   * Ajoute un critère à la requête.
   *
   * Si cette directive est utilisée seule, cela permet de faire correspondre les
   * objets qui disposent de cet index quel que soit sa valeur. Sinon cette
   * directive est généralement suivi d'une condition comme {@link EntityQuery#in|in},
   * {@link EntityQuery#greaterThan|greaterThan}, etc.
   *
   * ##### examples
   * Sélection des personnes qui ont un index "job"
   * ```javascript
   * lassi.entity.Person.match('job');
   * ```
   *
   * Sélection des personnes de plus de 30 ans :
   * ```javascript
   * lassi.entity.Person.match('age').greaterThan(30);
   * ```
   *
   * @param {String} indexName L'index tel que déclaré via {@link Entity#addIndex} ou
   * `oid` pour l'identifiant de l'objet.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  match (indexName) {
    this.clauses.push({type: 'match', index: this.getIndex(indexName)})
    return this
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est différente à une
   * valeur donnée.
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (pour chaînage)
   */
  notEquals (value, fieldValue) {
    if (typeof fieldValue !== 'undefined') {
      this.match(value)
      value = fieldValue
    }
    return alterLastMatch(this, {value: value, operator: '<>'})
  }

  /**
   * Remonte les enregistrement dont les valeurs d'index ne sont pas dans la liste
   * @param {String[]|Integer[]|Date[]} value Les valeurs à exclure
   * @return {EntityQuery} La requête (pour chaînage)
   */
  notIn (values) {
    checkIsArray(values)
    return alterLastMatch(this, {value: values, operator: 'NOT IN'})
  }

  /**
   * Remonte uniquement les entités softDeleted (inutile avec deletedAfter ou deletedBefore)
   * @return {EntityQuery} La requête (pour chaînage)
   */
  onlyDeleted () {
    this.clauses.push({type: 'match', index: this.getIndex('__deletedAt'), operator: 'ISNOTNULL'})
    return this
  }

  /**
   * @callback purgeCallback
   * @param {Error} error
   * @param {number} nbDeleted le nb d'objets effacés
   */
  /**
   * Efface toutes les entités de la collection (qui matchent la requête si y'en a une qui précède)
   * @param {purgeCallback} callback
   */
  purge (callback) {
    const record = prepareRecord(this)
    this.entity.getCollection()
      .deleteMany(record.query, null, function (error, result) {
        if (error) return callback(error)
        // on ajoute ça pour comprendre dans quel cas deleteMany ne remonte pas de deletedCount
        if (!result) {
          console.error('deleteMany ne remonte pas de result dans purge, avec', record.query)
        } else if (!result.hasOwnProperty('deletedCount')) {
          console.error('deleteMany remonte un result sans propriété deletedCount', result, 'avec la query', record.query)
        }
        const deletedCount = (result && result.deletedCount) || (result && result.result && result.result.n) || 0
        callback(null, deletedCount)
      })
  }

  /**
   * @callback softPurgeCallback
   * @param {Error} error
   * @param {number} nbSoftDeleted le nb d'objets softDeleted
   */
  /**
   * Efface toutes les entités de la collection (qui matchent la requête si y'en a une qui précède)
   * @param {softPurgeCallback} callback
   */
  softPurge (callback) {
    const record = prepareRecord(this)
    const today = new Date()
    this.entity.getCollection()
      // @see http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#updateMany
      .updateMany(record.query, {$set: {__deletedAt: today}}, (error, updateWriteOpResult) => {
        if (error) return callback(error)
        // @see http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~updateWriteOpResult
        const nbSoftDeleted = updateWriteOpResult && updateWriteOpResult.result && updateWriteOpResult.result.nModified
        if (typeof nbSoftDeleted !== 'number') {
          console.error(new Error('updateMany ne remonte pas l’objet attendu dans softPurge'), updateWriteOpResult, record.query)
        }
        callback(null, nbSoftDeleted)
      })
  }

  /**
   * Tri le résultat de la requête.
   * @param {String} indexName L'index sur lequel trier
   * @param {String=} [order=asc] Comme en SQL, asc ou desc.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  sort (indexName, order) {
    order = order || 'asc'
    this.clauses.push({type: 'sort', index: this.getIndex(indexName), order: order})
    return this
  }

  /**
   * Ajoute un critère de recherche plain text
   * @param search
   * @return {EntityQuery} La requête (pour chaînage)
   */
  textSearch (search) {
    this.search = search
    return this
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est vraie.
   *
   * @return {EntityQuery} La requête (pour chaînage)
   */
  true () {
    return this.equals(true)
  }

  /**
   * @alias equals
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (pour chaînage)
   */
  with (value) {
    return alterLastMatch(this, {value: value, operator: '='})
  }
}

// on exporte aussi notre constante, pour permettre aux applis de ne pas la dépasser
/**
 * Limite max qui sera imposée à grab
 * @memberOf EntityQuery
 * @type {number}
 */
EntityQuery.HARD_LIMIT_GRAB = HARD_LIMIT_GRAB

module.exports = EntityQuery
