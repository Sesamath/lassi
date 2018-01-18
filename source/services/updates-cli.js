'use strict'
const log = require('an-log')('lassi-cli')

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

// @todo ajouter un reRunUpdate qui permet de relancer un update passé
// - sans lock de maintenance
// - avec un check qui vérifie qu'il est déjà "normalement" passé,
// => il faut `--force` pour l'appliquer quand même si la version courante est < à l'update

/**
 * Service de gestion des updates via cli
 * @service $update-cli
 */
module.exports = function () {
  return {
    commands: () => ({
      runPendingUpdates
    })
  }
}
