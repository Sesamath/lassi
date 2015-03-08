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
var fs           = require('fs');
var pathLib      = require('path');
var should       = require('./tools/Asserts');
var Services     = require('./tools/Services');
var EventEmitter = require('events').EventEmitter
var util         = require('util');

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

  this.root = fs.realpathSync(root);
  if (!this.root) throw new Error('Unable to find root (call Sameen) :'+root);

  while (!fs.existsSync(this.root+'/config')) {
    this.root = pathLib.resolve(this.root, '..');
    if (this.root=='/') throw new Error('Impossible de trouver la configuration');
  }
  var configPath = fs.realpathSync(pathLib.resolve(this.root, 'config'));
  this.settings = require(configPath);
  should.object(this.settings, 'La configuration doit être un objet');
  this.loadSettings();

  this.transports = {};
  this.components = {};
  this.services = new Services();
  this.mainComponent = this.component('');
  var Controllers = require('./Controllers');
  this.controllers = new Controllers(this);
  var self = this;
  this.services.register('$entities', function() {
    var Entities = require('./entities');
    var entities = new Entities(self.settings.entities);
    return entities;
  });
  this.services.register('$cache', function() {
    var Manager = require('./cache');
    var manager = new Manager();
    return {
      get       : function() { manager.get.apply(manager, arguments); },
      set       : function() { manager.set.apply(manager, arguments); },
      delete    : function() { manager.delete.apply(manager, arguments); },
      addEngine : function() { manager.addEngine.apply(manager, arguments); }
    }
  });

  // Logging
  this.on('afterRailUse', function(name, settings, object) {
    var tmp = [];
    for(var key in settings) {
      if (typeof settings[key] === 'function') {
        tmp.push(key.green+':'+'function'.cyan);
      } else if (key!='mountPoint' || settings[key] !== '/') {
        tmp.push(key.green+':'+settings[key].toString());
      }
    }
    console.log("Rail ❭ ".grey+name+' {'.blue+tmp.join(', ')+'}'.blue);
    if (name == 'Controllers') {
      object.on('request', function(context) {
        console.log('Request: '+context.method+' '+context.url);
      });
    }
  });
}
util.inherits(Lassi, EventEmitter)

/**
 * Démarre l'application.
 * @fires Lassi#bootstrap
 * @private
 */
Lassi.prototype.bootstrap = function(component) {
  var self = this;

  flow()
  .seq(function() {
    var HtmlTransport = require('./transport/html');
    var JsonTransport = require('./transport/json');
    var RawTransport = require('./transport/raw');
    self.transports.html = new HtmlTransport(self);
    self.transports.json = new JsonTransport(self);
    self.transports.raw = new RawTransport(self);
    self.transports['text/plain'] = self.transports.raw;
    self.transports['text/html'] = self.transports.html;
    self.transports['application/json'] = self.transports.json;
    self.transports['application/jsonp'] = self.transports.json;

    this();
  })
  .seq(function() { component.configure(); this(); })
  .seq(function() { self.services.resolve('$entities').initializeStorage(this); })
  .seq(function() { self.initializeRail(this); })
  .seq(function() {
    var port = self.settings.server.port
    console.log('Listening for peoples on port ' +port);
    self.server = self.rail.listen(port, function() {
      /**
       * Évènement généré une fois que l'application est en écoute du port.
       * @event Lassi#bootstrap
       */
       self.emit('bootstrap');
     });
     function onTerminate() {
       //if (self.sessionStore) {
         //self.sessionStore.store();
       //}
       process.exit();
     }
     process.on('SIGTERM', onTerminate);
     process.on('SIGINT', onTerminate);
  });
}


/**
 * Chargement de la configuration.
 * @private
 */
Lassi.prototype.loadSettings = function() {
  should.object(this.settings.application, "Le champ 'application' n'est pas présent dans la configuration", this.loadSettings);
  should.string(this.settings.application.name, "Le réglage 'application.name' doit être défini", this.loadSettings);
  this.name = this.settings.application.name;
  this.staging = this.settings.application.staging;

  // Paramétrage des slots de config par défaut
  _.defaults(this.settings, {
    locales  : {},
    rail     : {},
    components  : {},
    server   : {},
    renderer : {}
  });

  // Config par défaut des components
  _.defaults(this.settings.components, {
    styles: false,
  });

  // Paramétrage des options serveur par défaut
  _.defaults(this.settings.server, {
    port: 3000
  });

  this.settings.components.users = false;
}


/**
 * Enregistre un {@link Component} dans le système.
 * @param {String} name Le nom du component
 * @param {array} dependencies Une liste de composant en dépendance
 */
Lassi.prototype.component = function(name, dependencies) {
  var settings;
  if (_.has(this.settings.components, name)) {
    settings = this.settings.components[name];
  }
  var component = new Component(name, dependencies, settings);

  // Bless the component....
  component.bless(this);

  // Enregistrement du component
  this.components[component.name] = component;

  return component;
}



/**
 * initialisation du rail pour notre express.
 * @param {SimpleCallback} next la callback de retour.
 * @private
 */
Lassi.prototype.initializeRail = function(next) {
  var self = this;
  var express = require('express');
  var rail = this.rail = express();


  /**
   * Wrapper permettant d'enregistrer un middleware sur le rail Express.
   * @fires Lassi#beforeRailUse
   * @fires Lassi#afterRailUse
   * @private
   */
  function railUse(name, callback, settings) {
    if (!settings) return;
    // @fixme virer ce commentaire si ce truc est mieux là (avant l'appel de callback,
    // je (DC) le verrai mieux entre l'appel et le rail.use mais je sais pas si des callback utilisent ce mountpoint)
    settings.mountPoint = settings.mountPoint || '/';

    /**
     * Évènement déclenché avant chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui seront appliqués au middleware
     */
    self.emit('beforeRailUse', name, settings);

    var middleware = callback(settings);
    if (!middleware) return;
    rail.use(settings.mountPoint, middleware);

    /**
     * Évènement déclenché après chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui ont été appliqués au middleware
     */
    self.emit('afterRailUse', name, settings, middleware);
  }
  this.use = railUse;

  var railConfig = this.settings.rail;

  railUse('compression', function() {
    return require('compression')();
  }, railConfig.compression);

  rail.use(function(request, response, next) {
    console.log("request: "+request.url);
    next();
  });


  // Gestion des sessions
  railUse('cookie', function(settings) {
    return require('cookie-parser')(settings.key)
  }, railConfig.cookie);

  var bodyParser = require('body-parser');
  var dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
  railUse('body-parser',
    function(settings) {
      return bodyParser(settings);
    },
    railConfig.bodyParser || {
      reviver: function (key, value) {
        if (typeof value === 'string') {
          if (dateRegExp.exec(value)) {
            return new Date(value);
          }
        }
        return value;
      }
    }
  );

  railUse('session', function(settings) {
    var session = require('express-session');
    var SessionStore = require('./SessionStore');
    settings.store = new SessionStore(self);
    return session(settings);
  }, railConfig.session);

  // Ajout du router principal
  railUse('controllers', function() { return self.controllers.middleware() }, {});

  // Lorsqu'il n'y a plus d'espoir...
  var CapitaineFlam = require('./CapitaineFlam');
  this.capitaineFlam = new CapitaineFlam(self);
  railUse('errors', function() { return self.capitaineFlam.middleware() }, {});

  next();
}


/**
 * Arrêt de l'application.
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
 * Définition d'une entité.
 * @param String name Le nom de l'entité.
 * @param function definition la définition de l'entité.
 * @return {Lassi} chaînable
 * @private
 */
Lassi.prototype.entity = function(name, definition) {
  return this;
}

module.exports = Lassi;
