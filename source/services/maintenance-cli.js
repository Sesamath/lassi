'use strict'

const anLog = require('an-log')('lassi')

/**
 * Active/désactive le mode maintenance
 * @param {string       } mode String pour activer ou non le mode maintenance
 * @param {errorCallback} done
 */
function setMaintenance (mode, message, done) {
  if (arguments.length === 1) throw new Error(`Vous devez passer un argument à cette commande`)
  if (typeof message === 'function') {
    done = message
    message = ''
  }
  lassi.service('$maintenance').setMaintenance(mode, {reason: 'manuel', message}, done)
}
setMaintenance.help = function setMaintenanceHelp () {
  const log = (...args) => anLog('maintenance-cli setMaintenance', 'usage', ...args)
  log(`La commande setMaintenance demande un ou deux argument(s)
arg1 : on|off pour activer/désactiver le mode maintenance
arg2 : Un message à afficher`)
}

/**
 * Service de gestion de la maintenance via cli
 * @service $maintenance-cli
 */
module.exports = function() {
  return {
    commands: () => ({
      setMaintenance,
    })
  }
}
