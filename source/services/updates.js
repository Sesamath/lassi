'use strict'

const _ = require('lodash')
const flow = require('an-flow')
const path = require('path')
const fs = require('fs')
const log = require('an-log')('$updates')

module.exports = function(LassiUpdate, $maintenance, $settings) {
  const updates = $settings.get('application.updates')
  if (!updates) throw new Error(`updatesFolder manquant dans les settings d'application`)

  const folder = updates.folder
  if (!folder) throw new Error(`folder manquant dans les settings d'application.updates`)
  const lock = updates.lockFile
  if (!lock) throw new Error(`lockFile manquant dans les settings d'application.updates`)


  function getUpdateFilename(num) {
    return path.join(folder, num + '.js')
  }

  function getLatestAppliedUpdate(cb) {
    LassiUpdate.match('num').sort('num', 'desc').grabOne(function(err, update) {
      if (err) return cb(err)
      cb(null, update ? update.num : 0)
    })
  }

  function updateExist(num, cb) {
    fs.access(getUpdateFilename(num), fs.R_OK, function (err) {
      cb(null, err ? false : true)
    })
  }

  function runUpdate(num, cb) {
    const update = require(getUpdateFilename(num))

    flow()
    .seq(function() {
      log(`lancement update n° ${num} : ${update.name}`)
      update.run(this)
    })
    .seq(function() {
      log(`fin update n° ${num}`)
      LassiUpdate.create({
        name: update.name,
        description: update.description,
        num
      }).store(this)
    })
    .seq(function() {
      log(`update n° ${num} OK, base en version ${num}`)
      cb()
    })
    .catch(function(err) {
      err._errorNum = num
      cb(err)
    })
  }

  function runNextUpdates(dbVersion, cb) {
    const nextUpdateNum = dbVersion + 1
    flow()
    .seq(function() {
      updateExist(nextUpdateNum, this)
    })
    .seq(function(exist) {
      if (exist) {
        runUpdate(nextUpdateNum, this)
      } else {
        // Find de la boucle récursive, on renvoie le dernier dbVersion à jour
        cb(null, dbVersion)
      }
    })
    .seq(function() {
      runNextUpdates(nextUpdateNum, this)
    })
    .done(cb)
  }

  function isUpdateLocked() {
    try {
      fs.accessSync(lock, fs.R_OK)
      return true
    } catch (error) {
      // lock n’existe pas,
      return false
    }
  }
  function lockUpdates() { fs.writeFileSync(lock, null) }
  function unlockUpdates() { fs.unlinkSync(lock) }

  function runPendingUpdates(cb) {
    function done(err) {
      // runPendingUpdates peut être appelé sans callback quand on n'a pas besoin d'attendre
      // la fin des updates
      if (cb) cb(err);
    }

    let maintenanceReason

    flow()
    .seq(function() {
      $maintenance.getMaintenanceMode(this)
    })
    .seq(function({mode, reason}) {
      // On active la maintenance si elle n'est pas déjà active
      if (mode === 'off') {
        maintenanceReason = 'update'
        $maintenance.setMaintenance('on', maintenanceReason, this)
      } else {
        log(`Mode maintenance déjà activé (${reason})`)
        maintenanceReason = reason
        this()
      }
    })
    .seq(function() {
      getLatestAppliedUpdate(this)
    })
    .seq(function(dbVersion) {
      if (isUpdateLocked()) {
        log(`${lock} présent, on ignore les updates automatiques, base en version ${dbVersion}`)
        return done()
      } else {
        log(`${lock} non présent, on étudie un éventuel update à lancer, base en version ${dbVersion}`)
      }
      lockUpdates()
      runNextUpdates(dbVersion, this)
    })
    .seq(function(updatedDbVersion) {
      log('plus d’update à faire, base en version', updatedDbVersion)
      if (maintenanceReason === 'update') {
        // On enlève la maintenance sauf si elle était déjà en place pour une autre raison (setings ou manuel)
        return $maintenance.setMaintenance('off', maintenanceReason, this)
      }
      this()
    })
    .done(function(err) {
      unlockUpdates()
      if (err) {
        log.error(`Une erreur est survenue dans l’update ${err._errorNum}`)
        log.error(err)
        if (maintenanceReason === 'update') {
          log.error(`Le mode maintenance sera automatiquement désactivé une fois l'update correctement terminée`)
        }
      }
      done(err)
    })

  }

  function postSetup (cb) {
    // On applique automatiquement les mises à jour au démarrage (hors cli)
    if (lassi.options.cli) {
      return cb();
    }
    // si on est en mode cluster avec pm2, on ne se lance que sur la 1re instance (0)
    // C'est une sécurité en plus du lockFile
    if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE > 0) {
      log('instance n° ' + process.env.NODE_APP_INSTANCE + ', abandon pour laisser l’instance 0 faire le job')
      return cb()
    }

    // On ne passe pas de callback car on n'a pas besoin d'attendre que les mises à jour
    // soient terminées pour démarrer le server, qui affichera un mode maintenance tant que
    // les mises à jours sont en cours.
    // Si elles échouent on en sera informé dans le log et la page de maintenance restera en place
    // jusqu'à résolution
    runPendingUpdates()
    cb()
  }

  return {
    postSetup,
    runPendingUpdates
  }
}
