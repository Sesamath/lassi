'use strict'

const fs = require('fs')
const log = require('an-log')('$maintenance')

module.exports = function ($settings) {
  const maintenanceConfig = $settings.get('application.maintenance', {})
  const lockFile = $settings.get('application.maintenance.lockFile', 'maintenance.lock')
  const defaultMessage = $settings.get('application.maintenance.message', 'Application en maintenance, merci d’essayer de nouveau dans quelques minutes')

  const maintenanceMiddleware = require('../maintenance/middleware')(maintenanceConfig);

  const DELAY_BETWEEN_LOCK_FILE_CHECKS = 5000
  let lastLockFileCheck
  let lastLockResult = {
    mode: 'off',
    reason: '',
    message: ''
  }
  // ce truc n'est plus très utile si on peut fixer la maintenance via le fichier de lock ou cli
  // mais ça prend pas de place…
  if (maintenanceConfig.active) {
    lastLockResult = {
      mode: 'on',
      reason: 'settings',
      message: defaultMessage
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
  function getMaintenanceMode(cb) {
    // On vérifie la présence du fichier lock-maintenance au maximum toutes les 5 secondes
    if (lastLockFileCheck && Date.now() < lastLockFileCheck + DELAY_BETWEEN_LOCK_FILE_CHECKS) {
      return cb(null, lastLockResult) // On utilise la dernière valeur connue
    }
    lastLockFileCheck = Date.now()
    fs.readFile(lockFile, 'utf8', function (err, message) {
      if (err) {
        // Une erreur veut dire que le fichier n'est pas accessible
        lastLockResult = {
          mode: 'off',
          message: ''
        }
      } else {
        lastLockResult = {
          mode: 'on',
          message: message || defaultMessage
        }
      }
      cb(null, lastLockResult)
    })
  }

  /**
   * Active/désactive le mode maintenance
   * @param {string} mode 'on' ou 'off', String pour activer ou non le mode maintenance
   * @param {string|object} [options] Si c'est une string sera interprété comme options.reason
   * @param {string} [options.reason] 'manual' si activé via cli ou 'update' si activé par une update
   * @param {string} [options.message] Le message à afficher
   * @param {errorCallback} done
   */
  function setMaintenance (mode, options, cb) {
    mode = mode.toLowerCase()
    if (!['on', 'off'].includes(mode)) throw new Error('valeur invalide pour paramètre mode')
    const reason = (typeof options === 'string') ? options : (options.reason || 'manual')
    const message = options.message || defaultMessage

    const done = (error) => {
      if (error) return cb(error)
      log(`Page de maintenance ${mode === 'on' ? 'activée' : 'désactivée'}.`)
      // Pour cette instance au moins le changement sera instantané
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
    return function(req, res, next) {
      getMaintenanceMode(function(err, {mode}) {
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
