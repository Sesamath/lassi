'use strict';
/*
 * @preserve
 * This file is part of "lassi".
 *    Copyright 2009-2014, arNuméral
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
 * 02110-1301 USA, or see the lassi.fs. site: http://www.lassi.fs..org.
 */

var flow          = require('seq');
var _             = require('underscore')._;
var fs            = require('fs');

/**
 * Callback simple.
 * @callback SimpleCallback
 * @param {Error} error Une erreur est survenue.
 */

/**
 * Évènement déclenché après le chargement d'un composant de lassi
 * @event Application#loaded
 * @param {String}  type Type de composant ('part', 'middleware', 'component')
 * @param {String}  name Le nom ou la classe du composant (ex. Entities);
 * @param {Object} instance L'instance du composant
 */

lassi.Class('lfw.framework.Application', {
  mixins: [lassi.Emitter],

  /**
   * Constructeur de l'application. Effectue les
   * initialisation par défaut.
   * Ce constructeur n'est jamais appelé directement. Utilisez {@link
   * lassi.Application}
   * @constructor
   * @param {String=} root La racine du projet. Par défaut il s'agit du dossier d'exécution du script.
   * @extends EventEmitter
   */
  construct: function(root) {
    /**
     * Path absolu vers le répertoire racine de l'appli
     * @type {string}
     */
    this.root = lassi.fs.realpathSync(root || lassi.fs.dirname(process.argv[1]));
    /**
     * Path du répertoire data
     * @type {string}
     */
    this.dataRoot = this.root;
    while (!lassi.fs.existsSync(this.dataRoot+'/config')) {
      this.dataRoot = lassi.fs.resolve(this.dataRoot, '..');
      if (this.dataRoot=='/') throw new Error('Impossible de trouver la configuration');
    }
    var configPath = lassi.fs.realpathSync(lassi.fs.resolve(this.dataRoot, 'config'));
    /**
     * Configuration (celle que renvoie config/index.js)
     * @type {Object}
     */
    this.settings = require(configPath);
    lassi.assert.object(this.settings, 'La configuration doit être un objet');
    /**
     * La liste des transports existants
     * @type {Object}
     */
    this.transports = {}
    /**
     * La liste des component
     * @type {Object}
     */
    this.components = {};

    //
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
      lassi.log.info("Rail ❭ ".grey+name+' {'.blue+tmp.join(', ')+'}'.blue);
      if (name == 'Controllers') {
        object.on('request', function(context) {
          lassi.log.debug('Request: '+context.method+' '+context.url);
        });
      }
    });
    this.on('loaded', function(type, name, object) {
      switch(type) {
        case 'part':
          lassi.log.info("Part ❭ ".grey+name);
          break;
        case 'command':
          lassi.log.info("  ➠ ".grey+name.green+' ➠ '.grey+object.description);
          break;
        case 'decorator':
          lassi.log.info("Decorateur ❭ ".grey+name.green+' ➠ '.grey+object.view+'#'+object.target);
          break;
        default:
          console.log('WTF', type, name);
      }
    });
  },

  /**
   * Démarre l'application en effectuant les tâches suivantes :
   *  - Chargement de la configuration,
   *  - Chargement des composants,
   *  - Initialisation des middlewares d'Express,
   *  - Initialisation des couches de transport,
   *  - Initialisation des composants,
   *  - Synchronization du modèle des entités,
   *  - Démarrage du service node_modules/lassi/classes/lfw/framework/Application.js
   * @param {Boolean=} [loadOnly=false] ne fait que charger les composants et leurs
   * enfants (contrôleurs, entités, etc)
   * @fires Application#loaded
   * @fires Application#boot
   */
  boot: function(loadOnly) {
    loadOnly = loadOnly || false;
    var _this = this;
    flow()
      .seq(function() { _this.loadSettings(); this(); })
      .seq(function() { _this.exploreComponents(this); })
      .seq(function() { if (loadOnly) return this() ; _this.initializeRail(this); })
      .seq(function() {
        if (loadOnly) return this() ;
        _this.transports.html = new lfw.framework.transport.HtmlTransport.Transport(_this);
        _this.transports.json = new lfw.framework.transport.JsonTransport(_this);
        _this.transports.none = new lfw.framework.transport.NoneTransport(_this);
        this();
      })
      .seq(function() {
        if (loadOnly) return this() ;
        var callbacks = new lfw.tools.Callbacks();
        _.each(_this.components, function(component) {
          if (component.initialize) callbacks.do(component.initialize, {
            context: component,
            description: component.name+"::initialize"});
        });
        callbacks.execute(this);
      })
      .seq(function() {
        if (loadOnly) return this() ;
        if (_this.entities) _this.entities.initializeStorage(this); else this();
      })
      .seq(function() {
        _this.emit('loaded', 'part', 'Application', _this);
        if (loadOnly) return this() ;
        var port = _this.settings.server.port
        lassi.log.info('Listening for peoples on port ' +port);
        _this.server = _this.rail.listen(port, function() {
          /**
           * Évènement généré une fois que l'application est en écoute du port.
           * @event Application#boot
           */
           _this.emit('boot');
         });
         function onTerminate() {
           //if (_this.sessionStore) {
             //_this.sessionStore.store();
           //}
           process.exit();
         }
         process.on('SIGTERM', onTerminate);
         process.on('SIGINT', onTerminate);
      });
  },


  /**
   * Chargement de la configuration.
   * @private
   */
  loadSettings: function() {
    lassi.assert.object(this.settings.application, "Le champ 'application' n'est pas présent dans la configuration", this.loadSettings);
    lassi.assert.string(this.settings.application.name, "Le réglage 'application.name' doit être défini", this.loadSettings);
    lassi.assert.string(this.settings.application.mail, "Le réglage 'application.mail' doit être défini", this.loadSettings);
    lassi.assert.string(this.settings.application.staging, "Le réglage 'application.staging' doit être défini", this.loadSettings);
    this.name = this.settings.application.name;
    this.mail = this.settings.application.mail;
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

    // Paramétrage des éléments du layout
    _.defaults(this.settings.layout, {
      temp    : this.root+"/../temp",
    });

    // On s'assure que chaque dossier du layout est bien créé et/ou existe.
    lassi.log.info('Layout    ❭'.grey+' root '.green+'➠ '.grey+this.root);
    for(var key in this.settings.layout) {
      lassi.fs.mkdirpSync(this.settings.layout[key]);
      this.settings.layout[key] = lassi.fs.realpathSync(this.settings.layout[key]);
      lassi.log.info('Layout    ❭'.grey+' root '+'➠ '.grey+this.root);
      lassi.log.info('Layout    ❭'.grey+key+' ➠ '.gray+this.settings.layout[key]);
    }

    this.settings.components.users = false;
  },

  /**
   * Détection et chargement des components
   * @param {SimpleCallback} next la callback de retour.
   * @private
   */
  exploreComponents: function(next) {
    var _this = this;
    flow()
      .seq(function() { _this.registerComponents(_this.root, this); })
      .seq(function() {
        if (_this.components.length) next(new Error("Aucun composant n'a été trouvé... pas cool !"));

        next();
      });
  },

  /**
   * Enregistre les composants présents dans un dossier donné.
   * @param {String} componentsPath le chemin de base des components
   * @param {SimpleCallback} next la callback de retour.
   * @private
   */
  registerComponents: function(componentsPath, next) {
    var _this = this;
    lassi.fs.readdir(componentsPath, function(error, componentNames) {
      if (error) throw error;
      componentNames = componentNames.filter(function(name) {
        return lassi.fs.statSync(componentsPath+'/'+name).isDirectory();
      });
      flow(componentNames)
        .seqEach(function(componentName) {
          if (componentName.indexOf('.map')!=-1) { this(); return; }
          _this.registerComponent(componentsPath, componentName, this);
        })
        .seq(function() {
          next()});
    });
  },

  /**
   * Enregistre un component dans le système.
   * @param {String} componentPath Le chemin vers le component
   * @param {String} componentName Le nom du component
   * @param {SimpleCallback} next la callback de retour.
   * @private
   */
  registerComponent: function(componentPath, componentName, next) {
    var config;
    if (_.has(this.settings.components, componentName)) config = this.settings.components[componentName];
    if (config===false) { next(); return; }
    var component;
    var componentFullPath = componentPath+'/'+componentName;
    try {
      component = require(componentFullPath);
    } catch(e) {
      // FIXME un require faux dans un component génère la même error.code
      if (e.code != 'MODULE_NOT_FOUND') throw e;
      component = new lfw.framework.Component();
    }
    lassi.assert.true(component.instanceOf(lfw.framework.Component), componentName+" n'est pas un composant.");

    // Exploration des classes
    var classPath = lassi.fs.resolve(componentFullPath, 'classes');
    if (fs.existsSync(classPath)) {
      lassi.classPath.addPath(classPath);
    }

    // Bless the component....
    this.bless(component, this, componentPath, componentName, config);

    // Enregistrement du component
    this.components[component.name] = component;


    // Est-ce que l'on a un aspect publique ?
    if (!component.publish) {
      var publicPath = lassi.fs.resolve(componentFullPath, 'public');
      if (fs.existsSync(publicPath)) {
        component.publish = publicPath;
      }
    }

    // C'est pas fini.. Recherche des contrôleurs du component
    var _this = this;
    lassi.log.info('Component ❭ '.grey+component.name);
    flow()
      .seq(function() { _this.registerControllers(component, this) })
      .seq(function() { _this.registerDecorators(component, this) })
      .seq(function() { _this.registerEntities(component, this);   })
      .seq(function() { next()});
  },

  /**
   * Enregistre les entités contrôleurs dans le composant.
   * @param {Component} component le composant parent
   * @param {SimpleCallback} next la callback de retour.
   * @private
   */
  registerControllers: function(component, next) {
    var path = lassi.fs.join(component.path, "controllers");
    var _this = this;
    lassi.fs.readdir(path, function(error, files) {
      if (error) {
        if (error.code == 'ENOENT') return next();
        return next(error);
      }
      files.forEach(function(file) {
        var controller = require(lassi.fs.join(path, file))
        var assertName = 'controller'+' ('.white+component.name.green+'#'+file.yellow+')';
        lassi.assert.not.empty(controller, assertName+" can't be empty");
        lassi.assert.true(controller.instanceOf(lfw.framework.Controller), assertName+" should be a lassi.Controller instance");
        controller = _this.bless(controller, file, component);
        component.controllers.push(controller);
        lassi.assert.not.empty(controller.actions, 'No action defined in '+assertName);
        for(var i in controller.actions) {
          var action = controller.actions[i];
          lassi.log.info('  ➠ '.grey+action.methods.join(',').toLowerCase().blue+' '+action.path.yellow);
        }
      });
      next();
    });
  },

  /**
   * Enregistre les décorateurs présents dans le composant.
   * @param {Component} component le composant parent
   * @param {SimpleCallback} next la callback de retour.
   * @private
   */
  registerDecorators: function(component, next) {
    var _this = this;
    var path = lassi.fs.join(component.path, "decorators");
    lassi.fs.readdir(path, function(error, files) {
      if (error) {
        if (error.code == 'ENOENT') return next();
        return next(error);
      }
      files.forEach(function(file) {
        var decorator = require(lassi.fs.join(path, file))
        var assertName = 'decorator'+' ('.white+file.yellow+')';
        lassi.assert.not.empty(decorator, assertName+" can't be empty.");
        decorator = _this.bless(decorator, file, component);
        component.decorators.push(decorator);
        _this.emit('loaded', 'decorator', decorator.name, decorator);
      });
      next();
    });
  },

  /**
   * Enregistre les entités présents dans le composant.
   * @param {Component} component le composant parent
   * @param {SimpleCallback} next la callback de retour.
   * @private
   * @fires Application#loaded
   */
  registerEntities: function(component, next) {
    var _this = this;
    var path = lassi.fs.join(component.path, "entities");
    lassi.fs.readdir(path, function(error, files) {
      if (error) {
        if (error.code == 'ENOENT') return next();
        return next(error);
      }
      files.forEach(function(file) {
        require(lassi.fs.join(path, file));
      });
      for(var entityName in lassi.entity) {
        _this.registerEntity(lassi.entity[entityName]);
      }
      next();
    });
  },

  registerEntity: function(entity) {
    if (!this.entities) {
      lassi.assert.not.empty(this.settings.entities, 'No settings for entities found in configuration.');
      this.entities = new lfw.entities.Manager(this.settings.entities);
      this.emit('loaded', 'part', 'Entities', this.entities);
    }
    entity = this.bless(entity, this.entities);
    this.entities.register(entity);
    return this;
  },

  /**
   * initialisation du rail pour notre express.
   * @param {SimpleCallback} next la callback de retour.
   * @private
   */
  initializeRail: function(next) {
    var _this = this;
    var express = require('express');
    var rail = this.rail = express();


    /**
     * Wrapper permettant d'enregistrer un middleware sur le rail Express.
     * @fires Application#beforeRailUse
     * @fires Application#afterRailUse
     * @private
     */
    function railUse(name, callback, settings) {
      if (!settings) return;
      // @fixme virer ce commentaire si ce truc est mieux là (avant l'appel de callback,
      // je (DC) le verrai mieux entre l'appel et le rail.use mais je sais pas si des callback utilisent ce mountpoint)
      settings.mountPoint = settings.mountPoint || '/';

      /**
       * Évènement déclenché avant chargement d'un middleware.
       * @event Application#beforeRailUse
       * @param {String}  name Le nom du middleware.
       * @param {Object} settings Les réglages qui seront appliqués au middleware
       */
      _this.emit('beforeRailUse', name, settings);

      var middleware = callback(settings);
      if (!middleware) return;
      rail.use(settings.mountPoint, middleware);

      /**
       * Évènement déclenché après chargement d'un middleware.
       * @event Application#beforeRailUse
       * @param {String}  name Le nom du middleware.
       * @param {Object} settings Les réglages qui ont été appliqués au middleware
       */
      _this.emit('afterRailUse', name, settings, middleware);
    }
    this.use = railUse;

    var railConfig = this.settings.rail;

    this.addPublicRoute = function(name, mountPoint, path) {
      if (mountPoint[0]!='/') mountPoint = '/'+mountPoint;
      railUse('public-'+name, function(settings) {
        return express.static(settings.path);
      }, {path: path, mountPoint: mountPoint});
    }

    railUse('compression', function() {
      return require('compression')();
    }, railConfig.compression);

    /*
    rail.use(function(request, response, next) {
      console.log("request: "+request.url);
      next();
    });
    */



    _.each(this.components, function(component) {
      if (component.publish) {
        _this.addPublicRoute(component.name, component.root, component.publish);
        var favicon = lassi.fs.resolve(component.publish, 'resource', 'images', 'favicon.ico');
        if (lassi.fs.existsSync(favicon))
          railUse('favicon', function(settings) {
              return require('static-favicon')(settings.path)
          }, {path: favicon});
      }
    }, this);


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
      settings.store = new lfw.framework.SessionStore(_this);
      return session(settings);
    }, railConfig.session);

    railUse('logger', function(settings) {
      var morgan = require('morgan');
      return morgan(settings);
    }, railConfig.logger);

    // Ajout du router principal
    this.controllers = new lfw.framework.Controllers(_this);
    railUse('controllers', function() { return _this.controllers.middleware() }, {});

    // Lorsqu'il n'y a plus d'espoir...
    this.errorHandler = new lfw.framework.ErrorHandler(_this);
    railUse('errors', function() { return _this.errorHandler.middleware() }, {});

    next();
  },


  /**
   * Arrêt de l'application.
   * @fires Application#shutdown
   */
  shutdown: function() {
    if (this.server) {
      /**
       * Évènement généré lorsque l'application est arrêtée par
       * la méthode shutdown.
       * @event Application#shutdown
       */
      this.emit('shutdown');
      this.server.close();
      delete this.server;
    }
  },

  /**
   * Bénit soit cet objet...
   * @param {Object} object L'objet à bénir
   * @param {...*} args Les attributs de la bénédiction
   * @private
   */
  bless: function(object) {
    var args = Array.prototype.slice.call(arguments, 1);

    object = object.bless.apply(object, args);
    if (_.isFunction(object.blessed)) {
      object.blessed.apply(object, args);
    }
    return object;
  }
});
