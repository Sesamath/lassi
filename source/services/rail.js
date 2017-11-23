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
    try {
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

      // bodyParser facultatif
      if (!railConfig.noBodyParser) {
        const bodyParser = require('body-parser')
        const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
        const bodyParserSettings = railConfig.bodyParser || {
          limit: '100mb',
          reviver: (key, value) => (typeof value === 'string' && dateRegExp.exec(value)) ? new Date(value) : value
        }
        railUse('body-parser', bodyParserSettings, (settings) => {
          const jsonMiddleware = bodyParser.json(settings)
          const urlencodedMiddleware = bodyParser.urlencoded(settings)
          // on wrap bodyParser pour récupérer les erreurs et logguer les url concernées
          return function bodyParserMiddleware (req, res, next) {
            // on pourrait mettre l'erreur en req.bodyParserError, avec un req.body = {} puis appeler next()
            // pour laisser le contrôleur décider du message à afficher (cf commit aeb1364)
            // mais on laisse express envoyer une erreur 400 tout de suite (finalement plus logique)
            // on ajoutant quand même dans le log d'erreur le contenu et l'url qui a provoqué ça
            // (et l'erreur de body-parser avec le body reçu, perdu si on passe ça à next)
            function errorCatcher (error) {
              if (error) {
                console.error(`Invalid content received on ${req.method} ${req.originalUrl}`, error)
                // express affiche la stacktrace en html, on veut un message plus intelligible mais sans stacktrace pour l'utilisateur
                return next('Invalid content')
              }
              next()
            }
            // c'est un peu idiot d'empiler les 2 middlewares sur pour toutes les requêtes,
            // mais c'est ce que faisait l'ancien body-parser générique
            // en attendant que les applis lassi décident sur chaque route quel parser elles veulent,
            // on continue avec ce comportement (le 2e parser rend la main aussitôt si le premier a fait qqchose)
            jsonMiddleware(req, res, (error) => {
              if (error) return errorCatcher(error)
              urlencodedMiddleware(req, res, errorCatcher)
            })
          }
        })
      }

      const secretSessionKey = $settings.get('$rail.session.secret')
      if (secretSessionKey) {
        log('adding session management on rail')
        // la session lassi a besoin d'un client redis, on prend celui de $cache défini à son configure
        const $cache = lassi.service('$cache')
        const redisClient = $cache.getRedisClient()
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
    } catch (error) {
      next(error)
    }
  }

  return {
    setup,
    /**
     * Renvoie le rail express (idem `require('express')()`) avec les middlewares en cours
     * @return {Express} express
     * @memberof $rail
     */
    get : () => _rail,
  }
}
