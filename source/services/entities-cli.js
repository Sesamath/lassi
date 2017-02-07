'use strict'

const flow = require('an-flow')
const defaultLimit = 100
const debug = global.cli && global.cli.debug

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
  const total = Entity.match().count()
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
}

/**
 * Affiche les entités demandées
 * @param {string} entityName Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string} fields Liste des champs à afficher (séparateur virgule)
 * @param {string} wheres Liste de conditions (array en json)
 * @param {errorCallback} done
 */
function select (entityName, fields, wheres, done) {
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
  if (typeof done !== 'function') done = arguments[arguments.length - 1]
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande')
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity (ou "help") en 1er argument'))
  if (entityName === 'help') {
    console.log('La commande select demande 3 arguments :')
    console.log('#1 : le nom de l’entité cherchée')
    console.log('#2 : la liste des champs à afficher, mettre une chaine vide pour les afficher tous')
    console.log('#3 : une chaine json présentant un tableau de conditions')
    console.log('       dont chaque élément est un tableau [champ, condition, valeur]')
    console.log('       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull')
    console.log('       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)')
    return done()
  }

  // les champs
  const fieldList = fields ? fields.split(',').map(field => field.trim()) : []

  try {
    let query
    const limit = 100;
    let offset = 0
    const Entity = lassi.service(entityName)
    if (!Entity) return done(new Error('Aucune entity nommée ' + entityName))
    query = Entity

    // les filtres pour le where
    if (wheres) {
      const filters = JSON.parse(wheres)
      if (!Array.isArray(filters)) throw new Error('le 3e arguments where doit être un tableau (string JSON) dont chaque élément est un tableau [champ, condition, valeur]')
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
      query = Entity.match()
    }

    // tabulation sommaire
    let titles = ''
    if (fields) {
      titles = fieldList.reduce((acc, field) => acc + field + '\t| ', '')
      console.log(titles)
    }

    const groupCb = (start, nb) => {
      console.log(`\n\n(fin select de ${start} à ${nb})`)
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

/**
 * Service de gestion des entités via cli
 * @service $entities-cli
 */
module.exports = function() {
  return {
    commands: () => ({
      reindexAll,
      select
    })
  }
}
