'use strict';

const fs = require('fs');
const log = require('an-log')('$rail');

/**
 * Service de gestion des middlewares
 * @namespace $rail
 */
module.exports = function ($settings) {
  const express = require('express');
  const _rail = express();

  /**
   * Enregistrer un middleware sur le rail Express avec lancement des events beforeRailUse et afterRailUse
   * @fires Lassi#beforeRailUse
   * @fires Lassi#afterRailUse
   * @private
   * @param {string} name Nom du middleware à ajouter sur le rail
   * @param {*} settings sera passé à middlewareGenerator
   * @param {function} middlewareGenerator sera appelé avec settings et devra renvoyer le middleware à ajouter
   */
  function railUse (name, settings, middlewareGenerator) {
    if (!settings) settings = {};
    if (!middlewareGenerator) throw new Error(`middleware ${name} sans callback`);
    const mountPoint = settings.mountPoint || '/';

    /**
     * Évènement déclenché avant chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {Express}  rail express
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui seront passés au créateur du middleware
     */
    lassi.emit('beforeRailUse', _rail, name, settings);

    const middleware = middlewareGenerator(settings);
    if (!middleware) return;
    _rail.use(mountPoint, middleware);

    /**
     * Évènement déclenché après chargement d'un middleware.
     * @event Lassi#afterRailUse
     * @param {Express}  rail express
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui ont été passés au créateur du middleware
     */
    lassi.emit('afterRailUse', _rail, name, settings, middleware);
  }

  /**
   * Retourne un booléen permettant de savoir si le mode maintenance est activé
   * @param {Object} maintenanceConfig             Les réglages qui seront appliqués au middleware :
   * @param {boolean} maintenanceConfig.active     booléen indiquant s'il faut activer le mode maintenance (prioritaire sur le lockFile)
   * @param {string} maintenanceConfig.lockFile    chemin du fichier indiquant si le mode maintenance est activé
   * @param {string} [maintenanceConfig.message]   message de maintenance à afficher
   * @param {string} [maintenanceConfig.htmlPage]  chemin relatif à la racine d'une page html à afficher
   * @param {string} [maintenanceConfig.staticDir] chemin relatif à la racine indiquant des éléments statiques pour htmlPage
   * @return {Boolean} Indique si le mode maintenance est activé
   */
  function isMaintenance (maintenanceConfig) {
    if (!maintenanceConfig) return false;

    let isActive = maintenanceConfig.active;
    // Par défaut, on privilégie les settings
    if (typeof isActive === 'boolean') return isActive;

    let lockFile = maintenanceConfig.lockFile;
    if (!lockFile) {
      log.error('lockFile manquant dans config.application.maintenance');
      return false;
    }

    return fs.existsSync(lockFile);
  }

  /**
   * Initialisation du service utilisé par lassi lors
   * de la configuration du composant parent.
   *
   * @param {function} next callback de retour
   * @memberof $rail
   * @private
   */
  function setup (next) {
    const railConfig = $settings.get('$rail');

    // compression
    railUse('compression', railConfig.compression, require('compression'));

    // cookie
    const sessionKey = $settings.get('$rail.cookie.key')
    if (!sessionKey) throw new Error('config.$rail.cookie.key manquant')
    railUse('cookie', sessionKey, require('cookie-parser'));

    // bodyParser
    const bodyParser = require('body-parser');
    const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    const bodyParserSettings = railConfig.bodyParser || {
      limit: '100mb',
      reviver: (key, value) => (typeof value === 'string' && dateRegExp.exec(value)) ? new Date(value) : value
    }
    railUse('body-parser', bodyParserSettings, (settings) => bodyParser(settings));

    // session
    railUse('session', railConfig.session, (settings) => {
      const session = require('express-session');
      const SessionStore = require('../SessionStore');
      settings.store = new SessionStore();
      return session(settings);
    });

    // maintenance ou controleurs "normaux"
    const maintenanceConfig = $settings.get('application.maintenance');
    if (isMaintenance(maintenanceConfig)) {
      maintenanceConfig.app = _rail;
      railUse('maintenance', maintenanceConfig, require('../controllers/maintenance'));
    } else {
      const Controllers = require('../controllers');
      const controllers = new Controllers(this);
      railUse('controllers', {}, () => controllers.middleware());
    }

    next();
  }

  return {
    setup,
    /**
     * Renvoie la liste des middlewares en cours;
     * @return {Express} expres
     * @memberof $rail
     */
    get : function () {
      return _rail;
    }
  }
}
