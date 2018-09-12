'use strict'

const anLog = require('an-log')('lassi-cli')

const log = (...args) => anLog('entities-cli reindexAll', ...args)

/**
 * Réindexe toutes les entités entityName
 * @param {string} entityName
 * @param {string} [argSup]
 * @param {errorCallback} done
 */
function reindexAll (entityName, argSup, done) {
  // options passées à forEachEntity
  const options = {progressBar: true}
  // check des arguments
  if (typeof argSup === 'function') {
    done = argSup
  } else if (argSup === 'continueOnError') {
    options.continueOnError = true
  }
  if (typeof done !== 'function') {
    const error = new Error('Reindex prend le nom de l’entity en premier argument et une callback en 2e')
    if (typeof entityName === 'function') return entityName(error)
    throw error
  }
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity en 1er argument'))

  let Entity
  try {
    Entity = lassi.service(entityName)
  } catch (error) {
    error.message = `Aucune entity nommée ${entityName} ${error.message}`
    return done(error)
  }

  // go
  Entity.match().includeDeleted().count((error, total) => {
    if (error) return done(error)
    if (total) {
      log(`Début de la ré-indexation de ${total} entités ${entityName}`)
      const forEachCb = (e, cb) => e.reindex(cb)
      const allDoneCb = (error) => {
        if (error) return done(error)
        log(`Ré-indexation de ${total} entités ${entityName} terminée`)
        done()
      }
      Entity.match().includeDeleted().sort('oid').forEachEntity(forEachCb, allDoneCb, options)
    } else {
      log(`Rien à réindexer pour ${entityName} (l’entité existe mais il n’y a aucun enregistrement)`)
      done()
    }
  })
}

reindexAll.help = function reindexAllHelp () {
  log('La commande reindexAll prend en 1er argument le nom de l’entité à réindexer\n  (commande allServices pour les voir dans la liste des services)\n  et un éventuel 2nd argument "continueOnError"\n(pour conserver les erreurs dans un fichier rediriger la sortie d’erreur avec "2>fichier.log")')
}

module.exports = reindexAll
