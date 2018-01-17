'use strict'

const _ = require('lodash')
const flow = require('an-flow')
const moment = require('moment')
const anLog = require('an-log')('lassi-cli')
// sera redéfini par chaque commande pour avoir le bon préfixe
let log = (...args) => anLog('entities-cli', ...args)
const defaultLimit = 100

/**
 * Helper pour lancer la récupération d'entité par paquets de limit
 * @private
 * @param {EntityQuery} query
 * @param {number} limit
 * @param {function} eachCb Callback appelée avec chaque entité remontée
 * @param options
 * @param done
 */
function grab (query, limit, eachCb, options, done) {
  function nextGrab () {
    let nb
    flow()
      .seq(function () {
        nb = 0
        query.grab({limit: limit, offset: offset}, this)
      })
      .seqEach(function (entity) {
        nb++
        eachCb(entity, this)
      })
      .seq(function () {
        if (options.groupCb) options.groupCb(offset, nb)
        if (nb === limit) {
          offset += limit
          setTimeout(nextGrab, 0)
        } else {
          done()
        }
      })
      .catch(done)
  }
  let offset = 0
  if (typeof options === 'function') {
    done = options
    options = {}
  }
  nextGrab()
}

/**
 * Traduit l'objet wheres en requête lassi sur Entity
 * @private
 * @param {Entity} Entity
 * @param {string} wheres un objet json (cf help pour la syntaxe)
 * @return {EntityQuery}
 */
function addConditions (Entity, wheres) {
  let query = Entity
  if (wheres) {
    const filters = parse(wheres)
    if (!filters || !Array.isArray(filters)) throw new Error('le 3e arguments where doit être un tableau (string JSON) dont chaque élément est un tableau [champ, condition, valeur]')
    filters.forEach(([ field, condition, value ]) => {
      if (!field) throw new Error('filtre invalide')
      if (condition === 'isNull') {
        query = query.match(field).isNull()
      } else if (condition === 'isNotNull') {
        query = query.match(field).isNotNull()
      } else {
        if (!value) throw new Error(`condition invalide (valeur manquante pour le champ ${field} et la condition ${condition})`)
        if (typeof value !== 'string') throw new Error(`condition invalide (valeur non string pour le champ ${field} et la condition ${condition})`)
        if (condition === '=') query = query.match(field).equals(value)
        else if (condition === '>') query = query.match(field).greaterThan(value)
        else if (condition === '>=') query = query.match(field).greaterThanOrEquals(value)
        else if (condition === '<') query = query.match(field).lowerThan(value)
        else if (condition === '<=') query = query.match(field).lowerThanOrEquals(value)
        else if (condition === '<>' || condition === '><') query = query.match(field).notIn([value])
        else if (condition === 'in' || condition === 'notIn') {
          // value doit être une liste avec la virgule en séparateur
          const values = value.split(',')
          if (condition === 'in') query = query.match(field).in(values)
          else query = query.match(field).notIn(values)
        } else throw new Error(`Condition ${condition} non gérée`)
      }
    })
  } else {
    query = query.match()
  }

  return query
}

/**
 * Parse une string json et retourne le résultat ou undefined si le parsing a planté
 * @param {string} json
 */
function parse (json) {
  try {
    return JSON.parse(json)
  } catch (error) {
    if (lassi.debug) {
      log.error('Error de parsing json sur ' + json)
      log.error(error)
    }
  }
}

/**
 * Réindexe toutes les entités entityName
 * @param {string} entityName
 * @param {errorCallback} done
 */
function reindexAll (entityName, done) {
  log = (...args) => anLog('entities-cli reindexAll', ...args)
  if (typeof done !== 'function') {
    const error = new Error('Reindex prend le nom de l’entity en premier argument et une callback en 2e')
    if (typeof entityName === 'function') return entityName(error)
    throw error
  }
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity en 1er argument'))
  const Entity = lassi.service(entityName)
  if (!Entity) return done(new Error('Aucune entity nommée ' + entityName))
  Entity.match().count((error, total) => {
    if (error) return done(error)
    if (total) {
      log(`Ré-indexation de ${total} entités ${entityName} :`)
      grab(
        Entity.match(),
        defaultLimit,
        (entity, next) => entity.reindex(next),
        { groupCb: (start, nb) => log(`Reindex ${entityName} OK (${start} à ${start + nb})`) },
        done
      )
    } else {
      log(`Rien à réindexer pour ${entityName} (l’entité existe mais il n’y a aucun enregistrement)`)
      done()
    }
  })
}
reindexAll.help = function reindexAllHelp () {
  log = (...args) => anLog('entities-cli reindexAll', ...args)
  log('La commande reindexAll prend en seul argument le nom de l’entité à réindexer\n  (commande allServices pour les voir dans la liste des services)')
}

/**
 * Affiche les entités demandées
 * @param {string} entityName Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string} [fields=''] Liste des champs à afficher (séparateur virgule)
 * @param {string} [wheres=''] Liste de conditions (array en json)
 * @param {string} [options=''] Liste de conditions (array en json)
 * @param {errorCallback} done
 */
function select (entityName, fields, wheres, options, done) {
  /**
   * Affiche une entité
   * @private
   * @param entity
   * @param next
   */
  function printOne (entity, next) {
    if (fields) {
      // en ligne
      log(fieldList.reduce((acc, field) => acc + entity[field] + '\t| ', ''))
    } else {
      // le json
      log('\n' + JSON.stringify(entity, null, 2))
    }
    next()
  }

  log = (...args) => anLog('entities-cli select', ...args)
  if (!arguments.length) throw new Error('Erreur interne, aucun arguments de commande')
  if (arguments.length === 2) {
    done = fields
    fields = ''
    wheres = ''
    options = ''
  } else if (arguments.length === 3) {
    done = wheres
    wheres = ''
    options = ''
  } else if (arguments.length === 4) {
    done = options
    options = ''
  }
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande')
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity (ou "help") en 1er argument'))

  const opts = {}
  options.split(',').forEach(elt => {
    const opt = elt.trim()
    if (opt) opts[opt] = true
  })

  const fieldList = fields ? fields.split(',').map(field => field.trim()) : []

  let query
  let Entity
  try {
    try {
      Entity = lassi.service(entityName)
    } catch (error) {
      return done(new Error(`Aucune entity nommée ${entityName} (utiliser la commande "allServices" pour voir services et entités)`))
    }
    query = addConditions(Entity, wheres)

    // Ligne de titres sommaire
    let titles = ''
    if (fields) {
      titles = fieldList.reduce((acc, field) => acc + field + '\t| ', '')
      log(titles)
    }

    const groupCb = (start, nb) => {
      if (opts.quiet) return
      log(`\n\n(fin select de ${start} à ${start + nb})`)
      if (nb === defaultLimit) log(titles)
    }

    grab(
      query,
      defaultLimit,
      printOne,
      { groupCb },
      done
    )
  } catch (error) {
    done(error)
  }
}
select.help = function selectHelp () {
  log = (...args) => anLog('entities-cli select', 'usage', ...args)
  log(`
La commande select demande 1 à 3 arguments :
#1 : le nom de l’entité cherchée
#2 : (facultatif) la liste des champs à afficher, mettre une chaine vide pour les afficher tous
#3 : (facultatif) une chaine json présentant un tableau de conditions
       dont chaque élément est un tableau [champ, condition, valeur]
       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull
       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)
#4 : (facultatif) une chaine présentant la liste des options (séparateur virgule)
       options: quiet => ne pas répéter la ligne de titre`)
}

/**
 * Affiche le nombre d'entités répondants aux critères
 * @param {string} entityName Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string} [wheres] Liste de conditions (array en json)
 * @param {errorCallback} done
 */
function count (entityName, wheres, done) {
  log = (...args) => anLog('entities-cli count', ...args)
  if (!arguments.length) throw new Error('Erreur interne, aucun arguments de commande')
  if (arguments.length === 1) {
    return entityName(new Error('Il faut passer un nom d’entity (ou "help") en 1er argument'))
  }
  if (arguments.length === 2) {
    done = wheres
    wheres = ''
  }
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande')

  try {
    let Entity
    try {
      Entity = lassi.service(entityName)
    } catch (error) {
      return done(new Error(`Aucune entity nommée ${entityName} (utiliser la commande "allServices" pour voir services et entités)`))
    }
    addConditions(Entity, wheres).count((error, nb) => {
      if (error) return done(error)
      log(`${nb} entités ${entityName} répondent aux conditions`)
      return done()
    })
  } catch (error) {
    done(error)
  }
}
count.help = function countHelp () {
  log = (...args) => anLog('entities-cli count', 'usage', ...args)
  log(`
La commande count demande 1 ou 2 arguments :
#1 : le nom de l’entité cherchée
#2 : (facultatif) une chaine json présentant un tableau de conditions
       dont chaque élément est un tableau [champ, condition, valeur]
       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull
       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)`)
}

/**
 * Purge les entités datant du nombre de jours indiqués
 * @param {string|Object} entity Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string}        nbDays Nombre de jours minimum pour que l'entité soit purgée
 * @param {errorCallback} done   Callback
 */
function purgeDeleted (entity, nbDays, done) {
  log = (...args) => anLog('entities-cli purge', ...args)
  if (!arguments.length) throw new Error('Erreur interne, aucun arguments de commande')
  if (arguments.length !== 3) {
    throw new Error(`Il faut passer un nom d’entity (ou l'entity) en premier argument
        et un nombre de jours en second argument`)
  }
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande')
  nbDays = Number(nbDays)
  if (!nbDays || nbDays <= 0) throw new Error('Le second argument doit être un nombre positif')

  try {
    let Entity
    if (_.isObject(entity)) {
      Entity = entity
    } else if (_.isString(entity)) {
      try {
        Entity = lassi.service(entity)
      } catch (error) {
        return done(new Error(`Aucune entity nommée ${entity} (utiliser la commande "allServices" pour voir services et entités)`))
      }
    } else {
      return done(new Error('Le premier argument doit être une string ou un objet'))
    }
    const date = moment().subtract(nbDays, 'days').toDate()
    flow()
      .seq(function () {
        Entity
          .match('__deletedAt').lowerThanOrEquals(date)
          .onlyDeleted()
          .purge(this)
      })
      .seq(function (nbDeleted) {
        log(`${nbDeleted} entités ${Entity.name} effacées depuis plus de ${nbDays} viennent d'être purgées`)
        done(null, nbDeleted)
      })
      .catch(done)
  } catch (error) {
    done(error)
  }
}
purgeDeleted.help = function purgeHelp () {
  log = (...args) => anLog('entities-cli purge', 'usage', ...args)
  log(`
La commande purge demande 2 arguments :
#1 : le nom de l’entité cherchée ou l'entité cherchée
#2 : le nombre de jours minimum pour que l'entité soit purgée`)
}

/**
 * Service de gestion des entités via cli
 * @service $entities-cli
 */
module.exports = function () {
  return {
    commands: () => ({
      count,
      purgeDeleted,
      reindexAll,
      select
    })
  }
}
