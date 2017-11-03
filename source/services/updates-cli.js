'use strict'
const log = require('an-log')('lassi-cli');

/**
 * Applique les mises à jour en attente
 * @param {errorCallback} done
 */
function runPendingUpdates (done) {
  lassi.service('$updates').runPendingUpdates(done)
}

runPendingUpdates.help = function () {
  log('La commande runPendingUpdates ne prend pas d’arguments, elle applique les mise à jour en attente')
}

/**
 * Service de gestion des updates via cli
 * @service $update-cli
 */
module.exports = function () {
  return {
    commands: () => ({
      runPendingUpdates,
    })
  }
}
