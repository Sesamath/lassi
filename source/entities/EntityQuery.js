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
 * Helper permettant d'altérer le dernièr match.
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
 * construit record.query à partir des matches
 * @param {EntityQuery} entityQuery
 * @param {EntityQuery~record} record
 * @private
 */
function buildQuery (entityQuery, record) {
  const query = record.query

  entityQuery.matches.forEach((match) => {
    if (!match) throw new Error('Erreur interne, requête invalide')
    const {path, fieldType, indexOptions} = match.index
    if (match.type === 'sort') {
      const order = match.order === 'desc' ? 'desc' : 'asc'
      record.options.sort = record.options.sort || []
      record.options.sort.push([path, order])
      return
    }

    if (match.type !== 'match') return
    if (!match.operator) return

    const normalizer = indexOptions && indexOptions.normalizer
    const normalize = (value) => {
      // si y'a un normalizer on l'applique
      if (normalizer) value = normalizer(value)
      // et si le type d'index est précisé faut caster les valeurs passées
      if (fieldType) return castToType(value, fieldType)
      return value
    }

    let condition
    const {value} = match
    switch (match.operator) {
      case '=':
        condition = {$eq: normalize(value)}
        break

      case '<>':
        condition = {$ne: normalize(value)}
        break

      case '>':
        condition = {$gt: normalize(value)}
        break

      case '<':
        condition = {$lt: normalize(value)}
        break

      case '>=':
        condition = {$gte: normalize(value)}
        break

      case '<=':
        condition = {$lte: normalize(value)}
        break

      case 'BETWEEN':
        condition = {$gte: normalize(value[0]), $lte: normalize(value[1])}
        break

      case 'LIKE':
        condition = {$regex: new RegExp(normalize(value).replace(/%/g, '.*'))}
        break

      case 'ISEMPTY':
        condition = {$eq: []}
        break

      case 'ISNULL':
        condition = {$eq: null}
        break

      case 'ISNOTNULL':
        condition = {$ne: null}
        break

      case 'NOT IN':
        condition = {$nin: value.map(normalize)}
        break

      case 'IN':
        condition = {$in: value.map(normalize)}
        break

      default:
        log.error(new Error(`operator ${match.operator} unknown`))
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
    record.query = _.merge(record.query, {$text: {$search: entityQuery.search}})
    // Le sort sur le score doit être fait avant les sorts "classiques", car on veut pas qu'un
    // sort vienne mettre un résultat "peu pertinent" avant d'autres.
    // On garde les sorts classique dans un searchOptions et on met le sort text seul
    // en projection (avant c'était dans les options mais ça passe plus en 3.0 ou 3.1
    // cf https://jira.mongodb.org/browse/NODE-1265?focusedCommentId=1767130&page=com.atlassian.jira.plugin.system.issuetabpanels%3Acomment-tabpanel#comment-1767130)
    // grab triera tout ça
    record.searchOptions = {
      project: {score: {$meta: 'textScore'}},
      sort: _.merge({score: {$meta: 'textScore'}}, sorts)
    }

    delete record.options.sort
  }

  if (entityQuery.debug) log('mongoQuery', record)
} // buildQuery

/**
 * Objet qui sera passé en 1er argument des commandes find|count de mongo
 * Chaque propriété est un chemin dans le document, sa valeur le filtre à y appliquer
 * @typedef EntityQuery~query
 */

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
 * @throws si value n'est pas un Array
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
function createEntitiesFromDocuments (entityQuery, rows) {
  // on veut des objets date à partir de strings qui matchent ce pattern de date.toString()
  const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
  const jsonDateReviver = (key, value) => (typeof value === 'string' && dateRegExp.test(value) && new Date(value)) || value
  return rows.map((row) => {
    let data = row._data
    if (!data) throw new Error(`Données absentes pour ${entityQuery.entity.name}/${row._id}`)

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
    const self = this
    const record = {query: {}, options: {}}
    flow().seq(function () {
      buildQuery(self, record)
      self.entity.getCollection().countDocuments(record.query, record.options, this)
    }).done(callback)
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

    const entityQuery = this
    const record = {query: {}, options: {}}
    buildQuery(entityQuery, record)
    // Cf https://docs.mongodb.com/manual/reference/method/db.collection.aggregate/
    const pipeline = [
      {$match: record.query},
      {$group: {_id: `$${path}`, count: {$sum: 1}}}
    ]
    const groupes = {}
    entityQuery.entity.getCollection().aggregate(pipeline).toArray((error, results) => {
      if (error) return callback(error)
      results.forEach(({_id, count}) => {
        groupes[_id] = count
      })
      callback(null, groupes)
    })
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
    const entityQuery = this
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
            if (options.continueOnError) {
              console.error(`Erreur sur ${entities[0].oid}`, error)
            } else {
              // on ajoute l'oid de l'entity dans le message
              error.message += ` (sur ${entities[0].oid})`
              return cb(error)
            }
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
      entityQuery.grab({limit: FOREACH_BATCH_SIZE, skip}, (err, entities) => {
        if (err) return finalCb(err)

        processEntities(entities, (e) => {
          if (e) return finalCb(e)
          if (progressBar) progressBar.tick(entities.length)
          if (entities.length < FOREACH_BATCH_SIZE) return finalCb() // dernier batch
          skip += FOREACH_BATCH_SIZE
          process.nextTick(nextBatch)
        })
      })
    }

    entityQuery.count((err, count) => {
      if (err) return finalCb(err)
      // en test progress plante parfois avec une largeur dispo NaN
      const isTestEnv = process.argv[1].includes('mocha') || process.env.NODE_ENV === 'test'
      // Attention, ProgressBar plante si le total est nul, cf https://github.com/visionmedia/node-progress/issues/166#issuecomment-498989236
      if (count && options.progressBar && !isTestEnv) {
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
    if (record.searchOptions) {
      // faut ajouter project + 2e sort (si fulltext, cf buildQuery)
      query
        .project(record.searchOptions.project)
        .sort(record.searchOptions.sort)
    }
    query
      .limit(record.limit)
      .toArray((error, documents) => {
        if (error) return callback(error)
        // on râle si on atteint la limite, sauf si on avait demandé cette limite
        if (documents.length === HARD_LIMIT_GRAB && options.limit !== HARD_LIMIT_GRAB) log.error('HARD_LIMIT_GRAB atteint avec', record)
        try {
          callback(null, createEntitiesFromDocuments(entityQuery, documents))
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
   * Filtre sur un index multiple ne contenant aucune valeur (fait du $eq: [])
   * (car isNull sur un index multiple remonte les entites ayant une valeur null ou undefined dans le tableau d'origine)
   * @return {EntityQuery}
   */
  isEmpty () {
    return alterLastMatch(this, {operator: 'ISEMPTY'})
  }

  /**
   * Limite aux entities ayant l'index précédent non null
   * (ATTENTION, sur un index multiple ce n'est pas le complément de isNull : la même entity
   * remonte dans les deux cas si la valeur est un array avec un élément null|undefined
   * et un autre élément non null|undefined)
   * @return {EntityQuery} La requête (pour chaînage)
   */
  isNotNull () {
    return alterLastMatch(this, {operator: 'ISNOTNULL'})
  }

  /**
   * Limite aux entities ayant l'index précédent null (ou undefined)
   * Attention, pour les index multiple ça remonte les entity dont l'array contient au moins un null|undefined
   * Pour remonter les entities ayant une valeur [] il faut utiliser isEmpty, ou alors utiliser une callback
   * d'index qui retourne null si le tableau est vide
   * @return {EntityQuery} La requête (pour chaînage)
   */
  isNull () {
    const lastMatch = getLastMatch(this)
    if (!lastMatch) throw Error('isNull appelé sans match précédent')
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
    if (values.length) alterLastMatch(this, {value: values, operator: 'NOT IN'})
    else console.error(Error(`notIn avec un array vide ne sert à rien, ignoré`))
    return this
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
    if (this.search) {
      if (search.includes(' ') && !search.includes('"')) this.search += ` "${search}"`
      else this.search += ` ${search}`
    } else {
      this.search = search
    }
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
