'use strict'

const fs = require('fs')

const express = require('express')
const {stringify} = require('sesajstools')

const log = require('an-log')('$rail')

/**
 * Service de gestion des middlewares
 * @namespace $rail
 */
module.exports = function ($maintenance, $settings) {
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
    if (!settings) settings = {}
    if (!middlewareGenerator) throw new Error(`middleware ${name} sans callback`)
    const mountPoint = settings.mountPoint || '/'

    /**
     * Évènement déclenché avant chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {Express}  rail express
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui seront passés au créateur du middleware
     */
    lassi.emit('beforeRailUse', _rail, name, settings)

    const middleware = middlewareGenerator(settings)
    if (!middleware) return
    _rail.use(mountPoint, middleware)

    /**
     * Évènement déclenché après chargement d'un middleware.
     * @event Lassi#afterRailUse
     * @param {Express}  rail express
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui ont été passés au créateur du middleware
     */
    lassi.emit('afterRailUse', _rail, name, settings, middleware)
  }

  /**
   * Initialisation du service utilisé par lassi lors de la configuration du composant parent.
   * @param {function} next callback de retour
   * @memberof $rail
   */
  function setup (next) {
    try {
      const railConfig = $settings.get('$rail', {})

      // maintenance (qui coupera tout le reste si elle est active)
      railUse('maintenance', {}, () => $maintenance.middleware())

      // compression (de la réponse si y'a du `Accept-Encoding: gzip` dans la requête,
      // il ajoutera aussi le `Vary: Accept-Encoding` dans toutes les réponses)
      railUse('compression', railConfig.compression, require('compression'))

      // cookie
      const sessionKey = $settings.get('$rail.cookie.key')
      if (sessionKey) {
        log('adding cookie management on rail')
        railUse('cookie', sessionKey, require('cookie-parser'))
      } else {
        log.error(new Error('config.$rail.cookie.key missing, => cookie-parser not used'))
      }

      // bodyParser sauf si on demande de pas le faire
      if (railConfig.noBodyParser) {
        log('bodyParser skipped as asked in config (noBodyParser)')
      } else {
        const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/
        const bodyParserSettings = railConfig.bodyParser || {
          reviver: (key, value) => (typeof value === 'string' && dateRegExp.exec(value)) ? new Date(value) : value
        }
        // on met quand même une limite très haute (sinon c'est 100kb par défaut)
        // l'application devrait mettre une limite plus basse en fonction de ce qu'elle attend
        if (!bodyParserSettings.limit) {
          bodyParserSettings.limit = '100mb'
        }
        railUse('body-parser', bodyParserSettings, (settings) => {
          // ne rien préciser est deprecated, on passe l'ancienne valeur par défaut
          // cf http://expressjs.com/en/resources/middleware/body-parser.html
          if (!settings.extended) settings.extended = true
          const jsonMiddleware = express.json(settings)
          const urlencodedMiddleware = express.urlencoded(settings)
          // on wrap bodyParser pour récupérer les erreurs et logguer les url concernées
          return function bodyParserMiddleware (req, res, next) {
            // on pourrait mettre l'erreur en req.bodyParserError, avec un req.body = {} puis appeler next()
            // pour laisser le contrôleur décider du message à afficher (cf commit aeb1364)
            // mais on laisse express envoyer une erreur 400 tout de suite (finalement plus logique)
            // on ajoutant quand même dans le log d'erreur le contenu et l'url qui a provoqué ça
            // (et l'erreur de body-parser avec le body reçu, perdu si on passe ça à next)
            function errorCatcher (error) {
              if (error) {
                const myError = new Error('Invalid content')
                if (error.status) myError.status = error.status
                console.error(`Invalid content received on ${req.method} ${req.originalUrl}`, error)
                // body-parser renvoie "Unexpected token # in JSON at position 0"
                // (un bug car c'est lui qui a mis le #),
                // on veut un message plus intelligible et sans stacktrace pour l'utilisateur
                return next(myError)
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

      // session sauf si on demande de pas le faire
      if (railConfig.noSession) {
        log('session management skipped as asked in config (noSession)')
      } else {
        const sessionSettings = $settings.get('$rail.session', {})
        const {secret} = sessionSettings
        if (secret) {
          log('adding session management on rail')
          // la session lassi a besoin d'un client redis, on prend celui de $cache défini à son configure
          const $cache = lassi.service('$cache')
          const redisClient = $cache.getRedisClient()
          const session = require('express-session')
          const RedisStore = require('connect-redis')(session)
          const sessionOptions = {
            mountPoint: $settings.get('lassi.settings.$rail.session.mountPoint', '/'),
            resave: false,
            saveUninitialized: sessionSettings.saveUninitialized || false,
            secret,
            store: new RedisStore({client: redisClient})
          }
          railUse('session', sessionOptions, session)
        } else {
          log.error('settings.$rail.session.secret not set => no session')
        }
      }

      // accessLog si demandé
      if (railConfig.accessLog) {
        const conf = railConfig.accessLog
        if (!conf.logFile) return log.error('settings $rail.accessLog.logFile is mandatory for logging')
        try {
          const fd = fs.openSync(conf.logFile, 'a')
          log(`adding access.log (${conf.logFile})`)
          const writeStream = fs.createWriteStream(null, {fd, 'flags': 'a'})
          // on a notre fichier, on met un listener pour le fermer
          lassi.on('shutdown', () => writeStream.end())
          // cf https://www.npmjs.com/package/morgan
          const morgan = require('morgan')
          // on met pas la forme réduite "combined", car on veut
          // - pouvoir ajouter des infos
          // - gérer correctement le x-real-ip
          // - avoir un :response-time à notre format (ms avec un seul chiffre après la virgule)
          // Cf https://github.com/expressjs/morgan
          let format = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time[1] :start'
          // on réécrit le token remote-addr pour prendre x-real-ip en premier s'il existe
          morgan.token('remote-addr', (req) => {
            if (req.headers && req.headers['x-real-ip']) return req.headers['x-real-ip']
            // le reste est la fct originale, cf node_modules/morgan/index.js
            if (req.ip) return req.ip
            if (req._remoteAddress) return req._remoteAddress
            if (req.connection) return req.connection.remoteAddress
            return undefined
          })
          // préciser qui met cette propriété start qui n'a pas l'air d'être une prop express
          // cf http://expressjs.com/en/4x/api.html#req
          morgan.token('start', (req) => req.start)
          if (conf.withSessionTracking) {
            format += ' :sessionId'
            const sessionCookieName = (railConfig.session && railConfig.session.name) || 'connect.sid'
            // on veut logguer un id pour tracer la navigation d'une session, mais on le prend pas en entier
            // pour que la lecture du log ne permette pas d'usurper une session
            morgan.token('sessionId', (req) => {
              if (req.headers && req.headers.cookie) {
                const re = new RegExp(`${sessionCookieName}=([^; $]+)`)
                const result = re.exec(req.headers.cookie)
                if (result && result[1] && result[1].length > 8) return decodeURIComponent(result[1]).substr(-8)
              }
              return '-'
            })
          } else {
            morgan.token('sessionId', () => '-')
          }
          /** Les options morgan */
          const morganOptions = conf.morgan || {}
          morganOptions.stream = writeStream
          // en dev on ajoute les var postées
          if (/^dev/.test(process.env.NODE_ENV)) {
            morgan.token('post', (req) => req.body ? '' : stringify(req.body))
            format += ' :post'
          }
          railUse('accessLog', true, () => morgan(format, morganOptions))
        } catch (error) {
          log.error(error)
        }
      }

      // les controleurs
      const Controllers = require('../controllers')
      const controllers = new Controllers(this)
      railUse('controllers', {}, () => controllers.middleware())

      // et notre errorHandler par défaut. Il ne servira pas si c'est un contrôleur qui fait du next(error),
      // car dans ce cas ça suit la chaîne jusqu'au transport (cf source/controllers/index.js)
      // cf http://expressjs.com/en/guide/error-handling.html
      _rail.use(function railErrorHandler (error, req, res, next) {
        res.status(error.status || 500)
        const errorMessage = error.toString()
        // la réponse avec res.format(html, json, default)
        // façon https://github.com/expressjs/express/blob/4.x/examples/error-pages/index.js#L64
        // répond en html si y'a pas de header accept, on gère manuellement pour envoyer du text/plain dans ce cas
        if (req.accepts('html')) {
          res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Error</title></head>
<body><pre>${errorMessage}</pre><p><a href="/">Home</a></p></body></html>`)
        } else if (req.accepts('json')) {
          res.json({ success: false, error: errorMessage })
        } else {
          res.type('txt').send(errorMessage)
        }
      })

      // fin de l'ajout des middleware
      next()
    } catch (error) {
      next(error)
    }
  } // setup

  const _rail = express()

  return {
    setup,
    /**
     * Renvoie le rail express (idem `require('express')()`) avec les middlewares en cours
     * @return {Express} express
     * @memberof $rail
     */
    get: () => _rail
  }
}
