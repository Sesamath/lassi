'use strict';
/*
 * @preserve
 * This file is part of "lassi".
 *    Copyright 2009-2015, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the fs. site: http://www.fs..org.
 */

var flow         = require('an-flow');
var _            = require('lodash');
var Component    = require('./Component');
var Services     = require('./tools/Services');
var EventEmitter = require('events').EventEmitter
var fs           = require('fs');
var log          = require('an-log')('lassi');
require('colors');

var shutdownRequested = false

/**
 * Callback simple.
 * @callback SimpleCallback
 * @param {Error} error Une erreur est survenue.
 */

/**
 * Constructeur de l'application. Effectue les
 * initialisation par défaut.
 * Ce constructeur n'est jamais appelé directement. Utilisez {@link
 * lassi.Lassi}
 * @constructor
 * @param {String=} root La racine du projet. Par défaut il s'agit du dossier d'exécution du script.
 * @extends Emitter
 */
class Lassi extends EventEmitter {

  constructor (options) {
    super();
    global.lassi = this;

    this.transports = {};
    var HtmlTransport = require('./transport/html');
    var JsonTransport = require('./transport/json');
    var RawTransport = require('./transport/raw');
    /**
     * Liste de transports (html, json et raw au bootstrap,
     * avec les alias 'text/html', 'application/json' et 'text/plain')
     */
    this.transports.html = new HtmlTransport(this);
    this.transports.json = new JsonTransport(this);
    this.transports.raw = new RawTransport(this);
    this.transports['text/plain'] = this.transports.raw;
    this.transports['text/html'] = this.transports.html;
    this.transports['application/json'] = this.transports.json;
    this.transports['application/javascript'] = this.transports.raw;

    this.components = {};
    this.services = new Services();
    lassi.options = options;
    var lassiComponent = lassi.component('lassi');
    lassiComponent.service('$settings', require('./services/settings'))
    lassiComponent.service('$cache', require('./services/cache'))
    lassiComponent.service('$entities', require('./services/entities'))
    if (lassi.options.cli) {
      lassiComponent.service('$cli', require('./services/cli'))
      lassiComponent.service('$entities-cli', require('./services/entities-cli'))
    } else {
      lassiComponent.service('$rail', require('./services/rail'))
      lassiComponent.service('$server', require('./services/server'));
    }

    options.root = fs.realpathSync(options.root);
    var settingsPath = options.root+'/config';
    lassi.settings = require(settingsPath);
    lassi.settings.root = options.root;
    // on ajoute un basePath s'il n'existe pas (le préfixe des routes pour des uri absolues)
    if (!lassi.settings.basePath) lassi.settings.basePath = '/'
    // et les composants par défaut en premier
    this.defaultDependencies = _.keys(lassi.components);
  }

  startup (component, next) {
    var self = this;
    component.dependencies = this.defaultDependencies.concat(component.dependencies);
    flow()
    // Configuration des composants
    .seq(function() { component.configure(); this(); })

    // Configuration des services
    .seq(function() {
      var setupables = [];
      _.each(self.services.services(), function(service, name) {
        service = self.services.resolve(name); // Permet de concrétiser les services non encore injectés
        if (!service) throw new Error("Le service " +name +" n'a pu être résolu (il ne retourne probablement rien)")
        if (service.setup) {
          if (!self.options.cli) log('setting up', name.blue);
          setupables.push(service);
        }
      });
      flow(setupables)
      .seqEach(function(service) { service.setup(this); })
      .done(this);
    })
    .empty().seq(function() {
      self.emit('startup');
      next();
    }).catch(next);
  }
  /**
   * Démarre l'application d'un composant.
   * @param {Component} component Le composant
   * @private
   */
  bootstrap(component, cb) {
    var self = this;
    flow()
    .seq(function() {
      self.startup(component, this);
    })
    .seq(function () {
      if (self.options.cli) return this();
      var $server = self.service('$server');
      $server.start(this);
    })
    .done(function(error) {
      if (error) console.error(error.stack);
      if (cb) cb(error);
    });
  }

  /**
   * Enregistre un {@link Component} dans le système.
   * @param {String} name           Le nom du component
   * @param {array}  [dependencies] Une liste de composant en dépendance
   */
  component(name, dependencies) {
    var component = this.components[name] = new Component(name, dependencies);
    return component;
  }

  service(name) {
    return this.services.resolve(name);
  }

  allServices() {
    return this.services.services();
  }

  /**
   * Arrêt de l'application.
   * @private
   * @fires Lassi#shutdown
   */
  shutdown() {
    function thisIsTheEnd() {
      log('shutdown completed');
      process.exit();
    }

    if (!shutdownRequested) {
      shutdownRequested = true

      try {
        log('processing shutdown');
        // avant de lancer l'événement on met une limite pour les réponses à 2s
        setTimeout(function () {
          log('shutdown too slow, forced');
          thisIsTheEnd();
        }, 2000);
        /**
         * Évènement généré lorsque l'application est arrêtée par la méthode shutdown.
         * @event Lassi#shutdown
         */
        this.emit('shutdown');

        // si on ferme la connexion à la base ici, les transactions en cours ne peuvent pas se terminer
        // même sur un reload pm2, on laisse la connexion expirer…
        // var $entities = this.service && this.service('$entities')
        // if ($entities) {
        //   $entities.database.end(function (error) {
        //     if (error) console.error(error)
        //     else console.log('Entities DB pool is closed')
        //   })
        // }

        // y'a des cas où this.service n'existe déjà plus !
        var $server = this.service && this.service('$server');
        if ($server) {
          $server.stop(thisIsTheEnd);
        } else {
          log('server is already gone');
          thisIsTheEnd();
        }
      } catch (error) {
        log('error on shutdown\n' + error.stack);
        process.exit();
      }
    }
  }
}


/**
 * Logger
 * @private
 */
Lassi.prototype.log = require('an-log')('lassi.log est DEPRECATED, fait ton propre `var log=require("an-log")("MonModule")` :-)');

module.exports = function(options) {
  if (typeof options=='string') {
    options = {
      root: options
    }
  }
  options.cli = !!options.cli;
  if (_.has(global, 'lassi')) {
    log('ERROR'.red, ' : lassi already exists')
    return lassi;
  }
  new Lassi(options);
  lassi.Context = require('./Context');
  lassi.require = function() {
    return require.apply(this, arguments);
  }

  // un écouteur pour tout ce qui pourrait passer au travers de la raquette
  // @see https://nodejs.org/api/process.html#process_event_uncaughtexception
  process.on('uncaughtException', function (error) {
    // on envoie l'erreur en console mais on va pas planter node pour si peu
    console.error('uncaughtException : ', error.stack);
  })

  // On ajoute nos écouteurs pour le shutdown
  // visiblement beforeExit arrive jamais, et exit ne sert que sur les sorties "internes"
  // via un process.exit() car sinon on reçoit normalement un SIG* avant
  if (!lassi.options.cli) {
    _.each(['beforeExit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'exit'], function (signal) {
      process.on(signal, function () {
        log('pid ' + process.pid + ' received signal ' + signal);
        lassi.shutdown();
      });
    })
  }

  // le message 'shutdown' est envoyé par pm2 sur les gracefulReload
  process.on('message', function (message) {
    // on récupère bien la string 'shutdown' qui est affichée ici
    log('message #' +message +'# of pid ' +process.pid);
    if (message === 'shutdown') {
      // mais on arrive jamais là, le process meurt visiblement avant
      log('launching shutdown');
      lassi.shutdown();
    }
  });
}

