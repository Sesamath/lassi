'use strict'

const fs = require('fs')
const _ = require('lodash')
const log = require('an-log')('$maintenance')

module.exports = function($settings) {
  const maintenanceConfig = $settings.get('application.maintenance')
  if (!maintenanceConfig) throw new Error(`maintenance manquant dans les settings d'application`)

  const lockFile = maintenanceConfig.lockFile
  if (!lockFile) throw new Error(`lockFile manquant dans les settings d'application.maintenance`)

  const maintenanceMiddleware = require('../maintenance/middleware')(maintenanceConfig);

  let lastLockFileCheck
  let lastLockFileMode
  let lastLockFileReason
  const DELAY_BETWEEN_LOCK_FILE_CHECKS = 5000

  function getMaintenanceModeFromLockFile(cb) {
    const done = () => cb(null, {mode: lastLockFileMode, reason: lastLockFileReason})

    // On vérifie la présence du fichier lock-maintenance au maximum toutes les 5 secondes
    if (lastLockFileCheck && lastLockFileMode && Date.now() < lastLockFileCheck + DELAY_BETWEEN_LOCK_FILE_CHECKS) {
      return done() // On utilise la dernière valeur connue
    }
    lastLockFileCheck = Date.now()
    fs.readFile(lockFile, 'utf8', function(err, reason) {
      lastLockFileMode = err ? 'off' : 'on' // Une erreur veut dire que le fichier n'est pas accessible
      lastLockFileReason = reason
      done()
    })
  }

  /**
   * Retourne le mode de maintenance actif ou inactif via un callback
   * La réponse passée en callback est de la forme
   * {
   *   mode: 'on' ou 'off'
   *   reason: 'manuel' ou 'update' ou 'settings'
   * }
   * @param {Callback} cb
   */
  function getMaintenanceMode(cb) {
    getMaintenanceModeFromLockFile(function(err, {mode, reason}) {
      if (err) return cb(err)

      // On peut forcer l'affichage du mode maintenance via la config
      if (mode === 'off' && maintenanceConfig.active) {
        mode = 'on'
        reason = 'settings'
      }

      return cb(null, {mode, reason})
    })
  }

  /**
   * Active/désactive le mode maintenance
   * @param {string} mode 'on' ou 'off', String pour activer ou non le mode maintenance
   * @param {string} reason 'manuel' si activé via cli ou 'update' si activé par une update
   * @param {errorCallback} done
   */
  function setMaintenance(mode, reason, cb) {
    mode = mode.toLowerCase()
    if (!['on', 'off'].includes(mode)) throw new Error('valeur invalide pour paramètre mode')
    if (!['manuel', 'update'].includes(reason)) throw new Error('valeur invalide pour paramètre reason')

    const done = (error) => {
      if (error) return cb(error)
      log(`Page de maintenance ${mode === 'on' ? 'activée' : 'désactivée'}.`)

      // Pour cette instance au moins le changement est instantané
      lastLockFileCheck = lastLockFileMode = undefined

      cb()
    }

    // On crée le lockFile
    if (mode === 'on') return fs.writeFile(lockFile, reason, 'utf8', done)
    // On supprime le lockFile
    if (mode === 'off') return fs.unlink(lockFile, done)
  }

  function middleware() {
    return function(req, res, next) {
      getMaintenanceMode(function(err, {mode}) {
        if (err) return next(err)

        if (mode === 'on') {
          // On passe la main au middleware de maintenance
          maintenanceMiddleware(req, res, next)
        } else {
          // On passe la main au middleware suivant (les controllers)
          next()
        }
      })
    }
  }

  return {
    setMaintenance,
    getMaintenanceMode,
    middleware
  }
}
