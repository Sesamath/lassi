'use strict'

const fs = require('fs')
const log = require('an-log')('$maintenance')

module.exports = function ($settings) {
  const maintenanceConfig = $settings.get('application.maintenance', {})
  const lockFile = $settings.get('application.maintenance.lockFile', 'maintenance.lock')

  const maintenanceMiddleware = require('../maintenance/middleware')(maintenanceConfig)

  // 10s entre le set en cli et son entrée en matière effective sur l'appli
  // (ou un set par l'appli et son application par les autres childs du cluster node)
  const DELAY_BETWEEN_LOCK_FILE_CHECKS = 10000
  const defaultResult = {
    mode: 'off',
    reason: ''
  }
  let lastLockFileCheck
  let lastLockResult = defaultResult
  // ce truc n'est plus très utile si on peut fixer la maintenance via le fichier de lock ou cli
  // mais ça prend pas de place… (et ça permet d'être sûr de démarrer tous les childs en mode maintenance,
  // mais faudra le désactiver et faire un reload manuel pour repasser en mode normal)
  if (maintenanceConfig.active) {
    lastLockResult = {
      mode: 'on',
      reason: 'settings'
    }
  }

  /**
   * @callback getMaintenanceModeCallback
   * @param {Object} result
   * @param {string} result.mode on|off
   * @param {string} result.reason 'manuel' ou 'update' ou 'settings' (ou n'importe quelle string mise dans le fichier de lock)
   */
  /**
   * Retourne le mode de maintenance actif ou inactif via un callback
   * @param {getMaintenanceModeCallback} cb
   */
  function getMaintenanceMode (cb) {
    // On vérifie la présence du fichier lock-maintenance au maximum toutes les 5 secondes
    if (lastLockFileCheck && Date.now() < lastLockFileCheck + DELAY_BETWEEN_LOCK_FILE_CHECKS) {
      return cb(null, lastLockResult) // On utilise la dernière valeur connue
    }
    lastLockFileCheck = Date.now()
    fs.readFile(lockFile, 'utf8', function (err, reason) {
      if (err) {
        // Une erreur veut dire que le fichier n'est pas accessible
        lastLockResult = defaultResult
      } else {
        lastLockResult = {
          mode: 'on',
          reason
        }
      }
      cb(null, lastLockResult)
    })
  }

  /**
   * Active/désactive le mode maintenance
   * @param {string} mode 'on' ou 'off', String pour activer ou non le mode maintenance
   * @param {string} reason 'manual' si activé via cli ou 'update' si activé par une update
   * @param {errorCallback} cb
   */
  function setMaintenance (mode, reason, cb) {
    mode = mode.toLowerCase()
    if (!['on', 'off'].includes(mode)) throw new Error('valeur invalide pour paramètre mode')
    if (!reason || typeof reason !== 'string') throw new Error('reason invalide')

    const done = (error) => {
      if (error) return cb(error)
      const etat = mode === 'on' ? 'activée' : 'désactivée'
      const sDelay = Math.round(DELAY_BETWEEN_LOCK_FILE_CHECKS / 1000)
      log(`Page de maintenance ${etat} (effectif dans ${sDelay}s)`)
      // Si cette instance déclenche elle même ce changement il sera instantané,
      // mais si c'est via un cli faudra attendre le délai
      lastLockFileCheck = undefined
      cb()
    }

    // On crée le lockFile
    if (mode === 'on') return fs.writeFile(lockFile, reason, 'utf8', done)
    // On supprime le lockFile
    if (mode === 'off') return fs.unlink(lockFile, done)
  }

  /**
   * Retourne le middleware de maintenance (qui est monté en premier dans la chaîne des middleware de lassi)
   * @return {expressMiddleware}
   */
  function middleware () {
    /**
     * @typedef expressMiddleware
     * @param req express request
     * @param res express response
     * @param next callback pour passer au middleware suivant
     */
    return function (req, res, next) {
      getMaintenanceMode(function (err, {mode}) {
        if (err) return next(err)

        if (mode === 'on') {
          // On passe la main au middleware de maintenance
          // (pas de next puisqu'il envoie la réponse)
          maintenanceMiddleware(req, res)
        } else {
          // On passe la main au middleware suivant
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
