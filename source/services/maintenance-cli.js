'use strict';

const fs = require('fs');
const _ = require('lodash');
const anLog = require('an-log')('lassi');
// sera redéfini par chaque commande pour avoir le bon préfixe
let log = (...args) => anLog('maintenance-cli', ...args);

/**
 * Active/désactive le mode maintenance
 * @param {string       } mode String pour activer ou non le mode maintenance
 * @param {errorCallback} done
 */
function setMaintenance (mode, done) {
  log = (...args) => anLog('maintenance-cli setMaintenance', ...args);
  if (arguments.length === 1) throw new Error(`Vous devez passer un argument à cette commande`);
  mode = mode.toLowerCase();
  if (mode !== 'on' && mode !== 'off') throw new Error(`L'argument doit valoir on ou off`);
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande');

  var maintenance = _.get(lassi.settings, 'application.maintenance');
  if (!maintenance) throw new Error(`maintenance manquant dans les settings d'application`);

  let lockFile = maintenance.lockFile;
  if (!lockFile) throw new Error(`lockFile manquant dans les settings d'application.maintenance`);

  // On crée le lockFile
  if (mode === 'on') {
    fs.writeFile(lockFile, '', (error) => {
      if (error) return done(error);
      log(`Le fichier de maintenance a bien été créé, veuillez relancer
        le serveur pour passer en mode maintenance`);
      return done();
    });
  }

  // On supprime le lockFile
  if (mode === 'off') {
    fs.unlink(lockFile, (error) => {
      if (error) return done(error);
      log(`Le fichier de maintenance a bien été supprimé, veuillez relancer
        le serveur pour désactiver le mode maintenance`);
      return done();
    });
  }
}
setMaintenance.help = function setMaintenanceHelp () {
  log = (...args) => anLog('maintenance-cli setMaintenance', 'usage', ...args);
  log(`
La commande setMaintenance demande un seul argument : on ou off pour savoir
s'il faut activer le mode maintenance ou non`);
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
  };
}
