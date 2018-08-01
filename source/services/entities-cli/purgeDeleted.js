'use strict'

const _ = require('lodash')
const flow = require('an-flow')
const moment = require('moment')
const anLog = require('an-log')('lassi-cli')

const log = (...args) => anLog('entities-cli purgeDeleted', ...args)

/**
 * Purge les entités plus vieilles que le nombre de jours indiqué (n × 24h)
 * @param {string|Object} entity Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string}        nbDays Nombre de jours minimum pour que l'entité soit purgée
 * @param {errorCallback} done   Callback
 */
function purgeDeleted (entity, nbDays, done) {
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
        log(`${nbDeleted} entités ${Entity.name} effacées depuis plus de ${nbDays}j viennent d'être purgées`)
        done(null, nbDeleted)
      })
      .catch(done)
  } catch (error) {
    done(error)
  }
}
purgeDeleted.help = function purgeHelp () {
  log(`Usage : 
La commande purge demande 2 arguments :
#1 : le nom de l’entité cherchée ou l'entité cherchée
#2 : le nombre de jours minimum pour que l'entité soit purgée`)
}

module.exports = purgeDeleted
