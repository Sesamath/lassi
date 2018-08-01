'use strict'
const flow = require('an-flow')
const anLog = require('an-log')('lassi-cli')
let log = (...args) => anLog('entities-cli', ...args)

/**
 * Parse une string json et retourne le résultat ou undefined si le parsing a planté
 * @private
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
 * Traduit l'objet wheres en requête lassi sur Entity
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

module.exports = {
  addConditions,
  grab
}
