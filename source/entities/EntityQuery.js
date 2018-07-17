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
 * Helper permettant d'altérer la dernière clause.
 * @param {EntityQuery} entityQuery
 * @param {Object} data les données à injecter.
 * @return {EntityQuery} La requête modifiée (pour chaînage)
 * @private
 */
function alterLastMatch (entityQuery, data) {
  Object.assign(getLastMatch(entityQuery), data)
  return entityQuery
}

/**
 * Applique les matches à la requête record.query
 * @param {EntityQuery} entityQuery
 * @param {EntityQuery~record} record
 * @private
 */
function buildQuery (entityQuery, record) {
  var query = record.query

  entityQuery.matches.forEach((clause) => {
    if (!clause) throw new Error('Erreur interne, requête invalide')
    const {path, fieldType} = clause.index
    if (clause.type === 'sort') {
      record.options.sort = record.options.sort || []
      record.options.sort.push([path, clause.order])
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
    if (!query[path]) query[path] = {}
    Object.assign(query[path], condition)
  })

  // par défaut on prend pas les softDeleted
  if (!query.__deletedAt && !entityQuery._includeDeleted) query.__deletedAt = {$eq: null}

  // on ajoute le cas fulltext
  if (entityQuery.search) {
    let sorts = {}
    _.forEach(record.options.sort, ([index, order]) => {
      sorts[index] = order === 'asc' ? 1 : -1
    })
    // Le sort sur le score doit être fait avant les sorts "classiques", car on veut pas qu'un
    // sort vienne mettre un résultat "peu pertinent" avant d'autres.
    // On garde les sorts classique dans un options.moreSort et on met le sort text seul dans les options
    // grab ajoutera le 2e sort ensuite
    record.moreSort = _.merge({score: {$meta: 'textScore'}}, sorts)
    delete record.options.sort
    record.query = _.merge(record.query, {$text: {$search: entityQuery.search}})
    record.options = _.merge(record.options, {score: {$meta: 'textScore'}})
  }

  if (entityQuery.debug) log('mongoQuery', record)
} // buildQuery

/**
 * Objet qui contient toutes les infos à passer à mongo pour exécuter la requête
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
 * @param {object|number} options Si number pris comme limit
 * @param {number} options.limit
 * @param {number} options.skip
 * @return {EntityQuery~record}
 */
function buildRecord (entityQuery, options) {
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
  if (typeof options.limit === 'number') {
    if (options.limit >= 0 && options.limit <= HARD_LIMIT_GRAB) {
      record.limit = options.limit
    } else {
      log.error(`limit ${options.limit} trop élevée, ramenée au max admis ${HARD_LIMIT_GRAB} (HARD_LIMIT_GRAB)`)
    }
  }
  // on passe à record.query
  buildQuery(entityQuery, record)

  return record
}

/**
 * Vérifie que value n'est pas falsy (sauf 0 qui est accepté)
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
  const jsonDateReviver = (key, value) => (typeof value === 'string' && dateRegExp.test(value) && new Date(value)) || value
  return rows.map((row) => {
    let data = row._data

    // TODO DATA: enlever ce if-bloc une fois que toutes les entités auront été ré-indexées
    //            avec un _data en objet mongo plutôt qu'un json
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data, jsonDateReviver)
      } catch (error) {
        console.error(error, `avec les _data :\n${row._data}`)
        // on renvoie un message plus compréhensible
        throw new Error(`Données corrompues pour ${entityQuery.entity.name}/${row._id}`)
      }
    }

    data.oid = row._id.toString()
    // __deletedAt n'est pas une propriété de _data, c'est un index ajouté seulement quand il existe (par softDelete)
    if (row.__deletedAt) data.__deletedAt = row.__deletedAt

    return entityQuery.entity.create(data)
  })
}

/**
 * Retourne le "matcher" en cours
 * @param {Object} entityQuery
 * @private
 */
function getLastMatch (entityQuery) {
  return _.last(entityQuery.matches)
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
    this.matches = []
    this.search = null
    this._includeDeleted = false
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
   * Compte le nombre d'objets que la requête courante remonterait (non chaînable)
   * @param {EntityQuery~CountCallback} callback
   * @return {undefined}
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
    const {path} = this.getIndex(index)

    var self = this
    var record = {query: {}, options: {}}

    flow()
      .seq(function () {
        buildQuery(self, record)
        const query = [
          {$match: record.query},
          {$group: {_id: `$${path}`, count: {$sum: 1}}}
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
   * Remonte les entités softDeleted après when
   * @param {Date} when
   * @return {EntityQuery} La requête (pour chaînage)
   */
  deletedAfter (when) {
    checkDate(when)
    this.matches.push({type: 'match', index: this.getIndex('__deletedAt'), operator: '>', value: when})
    return this
  }

  /**
   * Remonte les entités softDeleted avant when (<=)
   * @param {Date} when
   * @return {EntityQuery} La requête (pour chaînage)
   */
  deletedBefore (when) {
    checkDate(when)
    this.matches.push({type: 'match', index: this.getIndex('__deletedAt'), operator: '<', value: when})
    return this
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est égale à une
   * valeur donnée.
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (pour chaînage)
   */
  equals (value) {
    return alterLastMatch(this, {value: value, operator: '='})
  }

  /**
   * raccourci pour .equals(false)
   * @return {EntityQuery} La requête (pour chaînage)
   */
  false () {
    return this.equals(false)
  }

  /**
   * Callback d'exécution d'une requête forEachEntity, appelé sur chaque résultat de la requête
   * @callback EntityQuery~ForEachEntityOnEachEntityCallback
   * @param {Entity} entity Un des résultats de la requête
   * @param {function} next Callback a appeler quand ce résultat est traité
   */
  /**
   * Callback final d'une requête forEachEntity, appelé quand tous les résultats ont été traités
   * @callback EntityQuery~ForEachEntityDoneCallback
   * @param {Error} error Une erreur est survenue.
   * @param {number} count Nombre total d'entités traitées
   */
  /**
   * Applique un traitement (onEachEntity) sur chaque entité correspondant à la EntityQuery en cours
   * Si une occurence lève une erreur, l'ensemble de la boucle est arrétée.
   * @param {EntityQuery~ForEachEntityOnEachEntityCallback} onEachEntity appelée avec (entity, next), next devra être rappelé après traitement avec une erreur éventuelle
   * @param {EntityQuery~ForEachEntityDoneCallback} done appelée à la fin avec (error, nbProcessedOk)
   * @param {object} [options]
   * @param {number} [options.limit] Le max du nb d'entity à traiter
   * @param {boolean} [options.progressBar] Passer true pour afficher la progression en console (donc si l'on a un tty, i.e. en cli sans redirection de stdout)
   * @param {boolean} [options.continueOnError] Passer true pour continuer en cas d'erreur (qui sera alors affichée dans console.error avec l'oid concerné)
   */
  forEachEntity (onEachEntity, done, options = {}) {
    const query = this
    const globalLimit = options.limit

    let skip = 0
    // le nb d'entités traitées
    let nbTreated = 0
    // le nb d'entités traitées en erreur (si options.continueOnError)
    let nbErrors = 0

    let progressBar

    const finalCb = (err) => {
      done(err, nbTreated, nbErrors)
    }

    const processEntities = (entities, cb) => {
      if (!entities.length) return cb()

      // On traite les entités au début du tableau jusqu'à ce qu'il soit vide
      try { // si 'onEachEntity' throw une erreur
        let called = false // garde-fou pour éviter que la définition de onEachEntity appelle plusieurs fois son callback (ce qui aurait un drôle d'effet!)
        onEachEntity(entities[0], (error) => {
          if (called) {
            console.error(new Error('ERROR: forEachEntity onEntity callback function called many times'))
            return
          }
          called = true

          if (error) {
            nbErrors++
            if (options.continueOnError) console.error(`Erreur sur ${entities[0].oid}`, error)
            else return cb(error)
          }
          nbTreated++

          // Sortie immédiate via le finalCb() global si on a atteint une limite arbitraire
          if (globalLimit && globalLimit <= nbTreated) return finalCb()
          processEntities(entities.slice(1), cb)
        })
      } catch (e) {
        return cb(e)
      }
    }

    const nextBatch = () => {
      query.grab({limit: FOREACH_BATCH_SIZE, skip}, (err, entities) => {
        if (err) return finalCb(err)

        processEntities(entities, (e) => {
          if (e) return finalCb(e)
          if (entities.length < FOREACH_BATCH_SIZE) return finalCb() // dernier batch

          if (progressBar) progressBar.tick(entities.length)
          skip += FOREACH_BATCH_SIZE
          process.nextTick(nextBatch)
        })
      })
    }

    query.count((err, count) => {
      if (err) return finalCb(err)
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
  } // forEachEntity

  /**
   * Racourci vers Entity#getIndex
   * @param {String} indexName
   */
  getIndex (indexName) {
    return this.entity.getIndex(indexName)
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
    const entityQuery = this
    if (_.isFunction(options)) {
      callback = options
      options = {}
    }
    const record = buildRecord(entityQuery, options)
    // mongo n'a pas l'air de gérer query.limit(0) correctement, donc on le fait manuellement
    if (record.limit === 0) return callback(null, [])
    const query = entityQuery.entity.getCollection()
      .find(record.query, record.options)
    // faut ajouter un 2e sort (si fulltext, cf buildQuery)
    if (record.moreSort) query.sort(record.moreSort)
    query
      .limit(record.limit)
      .toArray((error, rows) => {
        if (error) return callback(error)
        // on râle si on atteint la limite, sauf si on avait demandé cette limite
        if (rows.length === HARD_LIMIT_GRAB && options.limit !== HARD_LIMIT_GRAB) log.error('HARD_LIMIT_GRAB atteint avec', record)
        try {
          callback(null, createEntitiesFromRows(entityQuery, rows))
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
    if (!values.length) console.error(new Error('paramètre de requête invalide (in veut un Array non vide)'), 'appelé avec :\n', this.matches)
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
    const lastMatch = getLastMatch(this)
    if (!lastMatch) throw Error('isNull appelé sans match précédent')
    if (lastMatch.index.indexOptions.sparse) throw Error('isNull() ne peut pas être appelé sur un index sparse')
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
    this.matches.push({type: 'match', index: this.getIndex(indexName)})
    return this
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est différente à une
   * valeur donnée.
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (pour chaînage)
   */
  notEquals (value) {
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
    this.matches.push({type: 'match', index: this.getIndex('__deletedAt'), operator: 'ISNOTNULL'})
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
    const record = buildRecord(this)
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
   * @callback softPurgeCallback
   * @param {Error} error
   * @param {number} nbSoftDeleted le nb d'objets softDeleted
   */
  /**
   * Efface toutes les entités de la collection (qui matchent la requête si y'en a une qui précède)
   * @param {softPurgeCallback} callback
   */
  softPurge (callback) {
    const record = buildRecord(this)
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
    this.matches.push({type: 'sort', index: this.getIndex(indexName), order: order})
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
   * raccourci pour .equals(true)
   *
   * @return {EntityQuery} La requête (pour chaînage)
   */
  true () {
    return this.equals(true)
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
