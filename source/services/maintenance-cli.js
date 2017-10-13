'use strict'

const anLog = require('an-log')('lassi')

/**
 * Active/désactive le mode maintenance
 * @param {string       } mode String pour activer ou non le mode maintenance
 * @param {errorCallback} done
 */
function setMaintenance (mode, done) {
  if (arguments.length === 1) throw new Error(`Vous devez passer un argument à cette commande`)

  lassi.service('$maintenance').setMaintenance(mode, 'manuel', done)
}
setMaintenance.help = function setMaintenanceHelp () {
  log = (...args) => anLog('maintenance-cli setMaintenance', 'usage', ...args)
  log(`La commande setMaintenance demande un seul argument : on ou off pour savoir
s'il faut activer le mode maintenance ou non`)
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
