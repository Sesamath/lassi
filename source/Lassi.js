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

const flow         = require('an-flow');
const _            = require('lodash');
const Component    = require('./Component');
const Services     = require('./tools/Services');
const EventEmitter = require('events').EventEmitter;
const fs           = require('fs');
const log          = require('an-log')('lassi');
// ajoute les propriétés de couleur sur les string ('toto'.blue pour l'afficher bleu si y'a un tty)
require('colors');

let shutdownRequested = false;

/**
 * Constructeur de l'application. Effectue les initialisations par défaut.
 * Ce constructeur n'est jamais appelé directement. Utilisez {@link lassi.Lassi}
 * @constructor
 * @param {String=} root La racine du projet. Par défaut il s'agit du dossier d'exécution du script.
 * @extends Emitter
 */
class Lassi extends EventEmitter {
  constructor (options) {
    super();
    global.lassi = this;

    this.transports = {};
    const HtmlTransport = require('./transport/html');
    const JsonTransport = require('./transport/json');
    const RawTransport = require('./transport/raw');
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
    // cette commande nous ajoute lassi en component
    const lassiComponent = lassi.component('lassi');
    lassiComponent.service('$settings', require('./services/settings'))
    lassiComponent.service('$cache', require('./services/cache'))
    lassiComponent.service('$entities', require('./services/entities'))
    lassiComponent.entity('LassiUpdate', require('./updates/LassiUpdate'))
    lassiComponent.service('$updates', require('./services/updates'));
    lassiComponent.service('$maintenance', require('./services/maintenance'));
    if (lassi.options.cli) {
      lassiComponent.service('$cli', require('./services/cli'))
      lassiComponent.service('$entities-cli', require('./services/entities-cli'))
      lassiComponent.service('$maintenance-cli', require('./services/maintenance-cli'))
      lassiComponent.service('$updates-cli', require('./services/updates-cli'))
    } else {
      lassiComponent.service('$rail', require('./services/rail'))
      lassiComponent.service('$server', require('./services/server'));
    }

    options.root = fs.realpathSync(options.root);
    let settingsPath = options.root + '/config';
    lassi.settings = require(settingsPath);
    lassi.settings.root = options.root;
    // On ajoute un basePath s'il n'existe pas (le préfixe des routes pour des uri absolues)
    if (!lassi.settings.basePath) lassi.settings.basePath = '/'
    // et les composants par défaut qui seront mis en premier (seulement lassi lui-même
    // mis par le lassi.component ci-dessus, mais on laisse ça au cas où qqun ajouterait
    // des components dans ce constructeur)
    this.defaultDependencies = _.keys(lassi.components);
  }

  startup (component, cb) {
    if (!cb) cb = (error) => error && console.error(error)
    log('startup component', component.name)
    const lassiInstance = this;
    component.dependencies = this.defaultDependencies.concat(component.dependencies);
    flow()
    // Configuration des composants
    .seq(function () {
      component.configure();
      this();
    })
    // Configuration des services
    .seq(function () {
      function addService (service, name) {
        if (added.has(name)) return
        added.add(name)
        service = lassiInstance.services.resolve(name); // Permet de concrétiser les services non encore injectés
        if (!service) throw new Error(`Le service ${name} n'a pu être résolu (il ne retourne probablement rien)`);
        if (service.setup) setupables.push(service)
        if (service.postSetup) postSetupable.push(service);
      }
      // pour mémoriser les services déjà ajoutés
      const added = new Set()
      // liste des setup à lancer
      const setupables = []
      // postSetup est utilisé pour les services qui ont des actions à faire quand tous les services
      // sont dispo (setup terminé, par ex pour que la BDD soit initialisée)
      // mais avant $server.start()
      const postSetupable = [];
      const services = lassiInstance.services.services()
      // on veut $settings puis $cache puis $entities dispos dans cet ordre,
      // pour que les autres setup puissent les utiliser
      ;['$settings', '$cache', '$entities'].forEach(name => addService(services[name], name))
      _.each(services, addService);
      // fin init
      log('starting setup chain', Array.from(added).join(', '))
      flow(setupables)
      .seqEach(function (service) {
        service.setup(this);
      })
      .seq(function() {
        log('starting postSetup chain')
        this(null, postSetupable);
      })
      .seqEach(function (service) {
        log('postSetup', service.serviceName);
        service.postSetup(this);
      })
      .done(this);
    })
    .seq(function () {
      log('startup event')
      lassiInstance.emit('startup');
      cb();
    })
    .catch(cb);
  }

  /**
   * Démarre l'application d'un composant.
   * @param {Component} component Le composant
   * @private
   */
  bootstrap (component, cb) {
    const lassiInstance = this;
    flow()
    .seq(function () {
      lassiInstance.startup(component, this);
    })
    .seq(function () {
      if (lassiInstance.options.cli) return this();
      const $server = lassiInstance.service('$server');
      $server.start(this);
    })
    .done(function (error) {
      if (error) console.error(error.stack);
      if (cb) cb(error);
    });
  }

  /**
   * Enregistre un {@link Component} dans le système.
   * @param {String} name           Le nom du component
   * @param {string[]}  [dependencies] Une liste de noms de composants en dépendance
   */
  component (name, dependencies) {
    return this.components[name] = new Component(name, dependencies);
  }

  /**
   * Enregistre un {@link Service} dans le système.
   * @param {String} name           Le nom du component
   */
  service (name) {
    return this.services.resolve(name);
  }

  /**
   * Liste tous les services enregistrés
   */
  allServices () {
    return this.services.services();
  }

  /**
   * Arrêt de l'application.
   * @private
   * @fires Lassi#shutdown
   */
  shutdown () {
    function thisIsTheEnd () {
      log('shutdown completed');
      process.exit();
    }

    if (!shutdownRequested) {
      shutdownRequested = true;

      try {
        log('processing shutdown');
        // Avant de lancer l'événement on met une limite pour les réponses à 2s
        setTimeout(function () {
          log('shutdown too slow, forced');
          thisIsTheEnd();
        }, 2000);

        /**
         * Évènement généré lorsque l'application est arrêtée par la méthode shutdown.
         * @event Lassi#shutdown
         */
        this.emit('shutdown');

        // Avec un sgbd, il fallait pas fermer la connexion ici
        // sinon les transactions en cours ne pouvaient pas se terminer
        // on laisse aussi à connexion à mongo expirer…
        // => pas de $entities.database.end()

        // Dans certains cas, this.service n'existe déjà plus !
        const $server = this.service && this.service('$server');
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

module.exports = function (options) {
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
  lassi.require = function () {
    return require.apply(this, arguments);
  }

  // Un écouteur pour tout ce qui pourrait passer au travers de la raquette
  // @see https://nodejs.org/api/process.html#process_event_uncaughtexception
  process.on('uncaughtException', (error) => {
    // On envoie l'erreur en console
    console.error('uncaughtException : ', error.stack);
  })

  // On ajoute nos écouteurs pour le shutdown car visiblement beforeExit n'arrive jamais, et exit ne sert
  // que sur les sorties "internes" via un process.exit() car sinon on reçoit normalement un SIG* avant
  if (!lassi.options.cli) {
    _.each(['beforeExit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'exit'], (signal) => {
      process.on(signal, () => {
        log('pid ' + process.pid + ' received signal ' + signal);
        lassi.shutdown();
      });
    })
  }

  // Le message 'shutdown' est envoyé par pm2 sur les gracefulReload
  process.on('message', (message) => {
    // On récupère bien la string 'shutdown' qui est affichée ici
    log(`message "${message}" of pid ${process.pid}`);
    if (message === 'shutdown') {
      // Mais on n'arrive jamais là, le process meurt visiblement avant
      log('launching shutdown');
      lassi.shutdown();
    }
  });
}
