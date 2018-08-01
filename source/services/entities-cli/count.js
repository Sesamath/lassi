'use strict'

const {addConditions} = require('./_helpers')
const anLog = require('an-log')('lassi-cli')

const log = (...args) => anLog('entities-cli count', ...args)

/**
 * Affiche le nombre d'entités répondants aux critères
 * @param {string} entityName Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string} [wheres] Liste de conditions (array en json)
 * @param {errorCallback} done
 */
function count (entityName, wheres, done) {
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
  log(`Usage :
La commande count demande 1 ou 2 arguments :
#1 : le nom de l’entité cherchée
#2 : (facultatif) une chaine json présentant un tableau de conditions
       dont chaque élément est un tableau [champ, condition, valeur]
       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull
       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)`)
}

module.exports = count
