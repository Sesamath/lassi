'use strict';

const express = require('express');
const fs = require('fs');
const log = require('an-log')('$rail');

/**
 * Service de gestion des middlewares
 * @namespace $rail
 */
module.exports = function ($maintenance, $settings) {
  const express = require('express');
  const _rail = express();
  let _redisClient

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
   * Initialisation du service utilisé par lassi lors de la configuration du composant parent.
   * @param {function} next callback de retour
   * @memberof $rail
   */
  function setup (next) {
    const railConfig = $settings.get('$rail');

    // maintenance (qui coupera tout le reste si elle est active)
    railUse('maintenance', {}, () => $maintenance.middleware());

    // compression
    railUse('compression', railConfig.compression, require('compression'));

    // cookie
    const sessionKey = $settings.get('$rail.cookie.key')
    if (sessionKey) {
      log('adding cookie management on rail')
      railUse('cookie', sessionKey, require('cookie-parser'));
    } else {
      log.error(new Error('config.$rail.cookie.key missing, => cookie-parser not used'))
    }

    // bodyParser
    const bodyParser = require('body-parser');
    const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    const bodyParserSettings = railConfig.bodyParser || {
      limit: '100mb',
      reviver: (key, value) => (typeof value === 'string' && dateRegExp.exec(value)) ? new Date(value) : value
    }
    railUse('body-parser', bodyParserSettings, (settings) => bodyParser(settings));

    const secretSessionKey = $settings.get('lassi.settings.$rail.session.secret')
    if (secretSessionKey) {
      log('adding session management on rail')
      // la session lassi a besoin d'un client redis, on prend celui de $cache défini à son configure
      const $cache = lassi.service('$cache')
      const redisClient = $cache.getRedisClient()
      log.debug('redisClient in session setup', redisClient)
      const session = require('express-session');
      const RedisStore = require('connect-redis')(session);
      const sessionOptions = {
        mountPoint: $settings.get('lassi.settings.$rail.session.mountPoint', '/'),
        store: new RedisStore({client: redisClient}),
        secret: secretSessionKey
      }
      railUse('session', sessionOptions, session)
    } else {
      log.error('settings.$rail.session.secret not set => no session')
    }

    const Controllers = require('../controllers');
    const controllers = new Controllers(this);
    railUse('controllers', {}, () => controllers.middleware());

    next();
  }

  return {
    setup,
    /**
     * Renvoie le rail express (idem `require('express')()`) avec les middlewares en cours
     * @return {Express} express
     * @memberof $rail
     */
    get : () => _rail,
    /**
     * Quick&Dirty récupération du client redis pour MemoryEngine
     */
    getRedisClient: () => _redisClient
  }
}
