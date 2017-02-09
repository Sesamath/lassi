'use strict'

const flow = require('an-flow')
const defaultLimit = 100
const debug = global.cli && global.cli.debug

/**
 * @callback entityCallback
 * @param {Entity} entity
 * @param {errorCallback} next
 */

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
    flow().seq(function () {
      nb = 0
      query.grab(limit, offset, this)
    }).seqEach(function (entity) {
      nb++
      eachCb(entity, this)
    }).seq(function () {
      if (options.groupCb) options.groupCb(offset, nb)
      if (nb === limit) {
        offset += limit
        setTimeout(nextGrab, 0)
      } else {
        done()
      }
    }).catch(done)
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
    filters.forEach(function ([ field, condition, value ]) {
      if (!field) throw new Error('filtre invalide')
      if (condition === 'isNull') {
        query = query.match(field).isNull()
      } else if (condition === 'isNotNull') {
        query = query.match(field).isNotNull()
      } else {
        // il faut une valeur
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
    // pas de filtre
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
    const retour = JSON.parse(json)
    return retour
  } catch (error) {
    if (lassi.debug) {
      console.error('Error de parsing json sur ' + json)
      console.error(error)
    }
  }
}

/**
 * Réindexe toutes les entités entityName
 * @param {string} entityName
 * @param {errorCallback} done
 */
function reindexAll (entityName, done) {
  if (typeof done !== 'function') {
    const error = new Error('reindex prend le nom de l’entity en premier argument et une callback en 2e')
    if (typeof entityName === 'function') return entityName(error)
    throw error
  }
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity en 1er argument'))
  const Entity = lassi.service(entityName)
  if (!Entity) return done(new Error('Aucune entity nommée ' + entityName))
  // on peut y aller
  Entity.match().count(function (error, total) {
    if (error) return done(error)
    if (total) {
      console.log(`ré-indexation de ${total} entités ${entityName} :`)
      grab(
        Entity.match(),
        defaultLimit,
        (entity, next) => entity.reindex(next),
        { groupCb: (start, nb) => console.log(`reindex ${entityName} OK (${start} à ${start + nb})`) },
        done
      )
    } else {
      console.log(`Rien à réindexer pour ${entityName} (l’entité existe mais il n’y a aucun enregistrements)`)
      done()
    }
  })
}
reindexAll.help = function reindexAllHelp () {
  console.log('La commande reindexAll prend en seul argument le nom de l’entité à réindexer\n  (commande allServices pour les voir dans la liste des services)')
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
      console.log(fieldList.reduce((acc, field) => acc + entity[field] + '\t| ', ''))
    } else {
      // le json
      console.log('\n' + JSON.stringify(entity, null, 2))
    }
    next()
  }

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
  if (entityName === 'help') {
    select.help()
    return done()
  }

  const opts = {}
  options.split(',').forEach(elt => {
    const opt = elt.trim()
    if (opt) opts[opt] = true
  })

  // les champs
  const fieldList = fields ? fields.split(',').map(field => field.trim()) : []

  let query
  const limit = 100;
  let offset = 0
  let Entity
  try {
    try {
      Entity = lassi.service(entityName)
    } catch (error) {
      return done(new Error(`Aucune entity nommée ${entityName} (utiliser la commande "allServices" pour voir services et entités)`))
    }
    query = addConditions(Entity, wheres)

    // ligne de titres sommaire
    let titles = ''
    if (fields) {
      titles = fieldList.reduce((acc, field) => acc + field + '\t| ', '')
      console.log(titles)
    }

    const groupCb = (start, nb) => {
      if (opts.quiet) return
      console.log(`\n\n(fin select de ${start} à ${start + nb})`)
      if (nb === defaultLimit) console.log(titles)
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
  console.log('La commande select demande 1 à 3 arguments :')
  console.log('#1 : le nom de l’entité cherchée')
  console.log('#2 : (facultatif) la liste des champs à afficher, mettre une chaine vide pour les afficher tous')
  console.log('#3 : (facultatif) une chaine json présentant un tableau de conditions')
  console.log('       dont chaque élément est un tableau [champ, condition, valeur]')
  console.log('       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull')
  console.log('       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)')
  console.log('#4 : (facultatif) une chaine présentant la liste des options (séparateur virgule)')
  console.log('       options: quiet => ne pas répéter la ligne de titre')
}

/**
 * Affiche le nb d'entités répondants aux critères
 * @param {string} entityName Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string} [wheres] Liste de conditions (array en json)
 * @param {errorCallback} done
 */
function count (entityName, wheres, done) {
  if (!arguments.length) throw new Error('Erreur interne, aucun arguments de commande')
  if (arguments.length === 2) {
    done = wheres
    wheres = ''
  }
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande')
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity (ou "help") en 1er argument'))

  if (entityName === 'help') {
    count.help()
    return done()
  }

  try {
    let Entity
    try {
      Entity = lassi.service(entityName)
    } catch (error) {
      return done(new Error(`Aucune entity nommée ${entityName} (utiliser la commande "allServices" pour voir services et entités)`))
    }
      console.log(`count`)
    addConditions(Entity, wheres).count({debug: lassi.debug}, function (error, nb) {
      console.log(`cb count`)
      if (error) return done(error)
      console.log(`${nb} entités ${entityName} répondent aux conditions`)
      done()
    })
  } catch (error) {
    done(error)
  }
}
count.help = function countHelp () {
  console.log('La commande count demande 1 ou 2 arguments :')
  console.log('#1 : le nom de l’entité cherchée')
  console.log('#2 : (facultatif) une chaine json présentant un tableau de conditions')
  console.log('       dont chaque élément est un tableau [champ, condition, valeur]')
  console.log('       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull')
  console.log('       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)')
}

/**
 * Service de gestion des entités via cli
 * @service $entities-cli
 */
module.exports = function() {
  return {
    commands: () => ({
      count,
      reindexAll,
      select
    })
  }
}
