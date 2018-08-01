'use strict'

const flow = require('an-flow')
const anLog = require('an-log')('lassi-cli')
// sera redéfini par chaque commande pour avoir le bon préfixe
let log = (...args) => anLog('entities-cli validAll', ...args)

/**
 * Passe en revue toutes les entités entityName pour vérifier la validation (schema + beforeStore),
 * sans modification de l'existant.
 * @param {string} entityName
 * @param {errorCallback} done
 */
function validAll (entityName, done) {
  // options passées à forEachEntity
  const options = {progressBar: true}
  if (typeof done !== 'function') {
    const error = new Error('validAll prend le nom de l’entity en premier argument et une callback en 2e')
    if (typeof entityName === 'function') return entityName(error)
    throw error
  }
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity en 1er argument'))

  const Entity = lassi.service(entityName)
  if (!Entity) return done(new Error('Aucune entity nommée ' + entityName))
  // go
  Entity.match().includeDeleted().count((error, total) => {
    if (error) return done(error)
    if (total) {
      log(`Début de la vérification de validité de ${total} entités ${entityName}`)
      let oidsWithError = []
      const forEachCb = (e, cb) => {
        // attention, l'appel de e.beforeStore lance la validation mais avec onlyChangedAttributes: true
        // on refait ici le chaînage de l'appel de beforeStore seul puis de la validation du schema
        // puis de la fct de validation
        const entity = e
        const def = e.definition
        flow().seq(function () {
          // beforeStore éventuel
          if (def._beforeStore) def._beforeStore.call(entity, this)
          else this()
        }).seq(function () {
          entity.isValid(this)
        }).seq(function () {
          cb()
        }).catch(function (error) {
          // on ne plante pas le batch sur une erreur, on la signale
          oidsWithError.push(e.oid)
          console.error(`Pb de validation de ${e.oid} :`, error)
          cb()
        })
      }
      const allDoneCb = (error) => {
        if (error) return done(error)
        log(`Vérification de validité de ${total} entités ${entityName} terminée avec ${oidsWithError.length} erreurs`)
        if (oidsWithError.length) {
          log('Les oid en erreurs : ')
          log(oidsWithError.join(' '))
        }
        done()
      }
      Entity.match().includeDeleted().sort('oid').forEachEntity(forEachCb, allDoneCb, options)
    } else {
      log(`Rien à valider pour ${entityName} (l’entité existe mais il n’y a aucun enregistrement)`)
      done()
    }
  })
}
validAll.help = function validAllHelp () {
  log('La commande validAll prend en 1er argument le nom de l’entité à réindexer\n  (commande allServices pour les voir dans la liste des services)\nPour conserver les erreurs dans un fichier rediriger la sortie d’erreur avec "2>fichier.log"')
}

module.exports = validAll
