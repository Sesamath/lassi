'use strict'

const anLog = require('an-log')('lassi')

/**
 * Active/désactive le mode maintenance
 * @param {string} mode on|off pour activer ou désactiver le mode maintenance
 * @param {errorCallback} done
 */
function setMaintenance (mode, done) {
  if (arguments.length === 1) throw new Error(`Vous devez passer un argument (on|off) à cette commande`)
  lassi.service('$maintenance').setMaintenance(mode.toLowerCase(), 'manuel', done)
}
setMaintenance.help = function setMaintenanceHelp () {
  const log = (...args) => anLog('maintenance-cli setMaintenance', 'usage', ...args)
  log(`La commande setMaintenance demande un ou deux argument(s)
arg1 : on|off pour activer/désactiver le mode maintenance`)
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
