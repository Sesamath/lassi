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

var flow         = require('seq');
var _            = require('underscore')._;
var Component    = require('./Component');
var Services     = require('./tools/Services');
var EventEmitter = require('events').EventEmitter
var util         = require('util');
var fs           = require('fs');
var tty          = require('tty');
require('colors');

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
function Lassi(root) {
  GLOBAL.lassi = this;

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
  this.transports['application/jsonp'] = this.transports.json;

  this.components = {};
  this.services = new Services();
  lassi.root = root;
  lassi.component('lassi')
    .service('$settings', require('./services/settings'))
    .service('$cache', require('./services/cache'))
    .service('$entities', require('./services/entities'))
    .service('$rail', require('./services/rail'))
    .service('$server', require('./services/server'));

  root = fs.realpathSync(root);
  var settingsPath = root+'/config';
  lassi.settings = require(settingsPath);
  lassi.settings.root = root;
  this.defaultDependencies = _.keys(lassi.components);
}

util.inherits(Lassi, EventEmitter)

Lassi.prototype.startup = function(component, next) {
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
      if (service.setup) {
        lassi.log("lassi", 'setting up', name.blue);
        setupables.push(service);
      }
    });
    flow(setupables)
    .seqEach(function(service) { service.setup(this); })
    .empty().seq(this).catch(this);
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
Lassi.prototype.bootstrap = function(component) {
  var self = this;
  flow()
    .seq(function() {
      self.startup(component, this);
    })
    .seq(function () {
      var $server = self.service('$server');
      $server.start(this);
    })
    .catch(function(error) {
      console.log(error.stack);
    });
}

/**
 * Enregistre un {@link Component} dans le système.
 * @param {String} name Le nom du component
 * @param {array} dependencies Une liste de composant en dépendance
 */
Lassi.prototype.component = function(name, dependencies) {
  return this.components[name] = new Component(name, dependencies);
}

Lassi.prototype.service = function(name) {
  return this.services.resolve(name);
}


/**
 * Arrêt de l'application.
 * @private
 * @fires Lassi#shutdown
 */
Lassi.prototype.shutdown = function() {
  if (this.server) {
    /**
     * Évènement généré lorsque l'application est arrêtée par
     * la méthode shutdown.
     * @event Lassi#shutdown
     */
    this.emit('shutdown');
    this.server.close();
    delete this.server;
  }
}

/**
 * Logger
 * @private
 */
Lassi.prototype.log = function(){
  var args = Array.prototype.slice.call(arguments);
  var first = args.shift();
  //if (level<Levels.info) return;
  var message = util.format.apply(console, args);
  var isatty = tty.isatty(1);
  var color = isatty;

  if (color) {
    console.log('['.white+first.yellow+']'.white, message);
  } else {
    message = '['+ first + '] ' + message;
    if (!isatty) {
      message = message.replace(/\x1b\[[^m]+m/g, '');
      message = message.replace(/\x1b/g, '');
    }
    console.log(message);
  }
  return this;
};

module.exports = function(root) {
  if (_.has(GLOBAL, 'lassi')) return lassi;
  new Lassi(root);
  lassi.Context = require('./Context');
  lassi.require = function() {
    return require.apply(this, arguments);
  }
}

