'use strict';
/*
 * @preserve This file is part of "lassi-example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var _          = require('underscore')._;
var should     = require('./tools/Asserts');
var Controller = require('./Controller');

/**
 * Construction d'un composant.
 * Ce constructeur n'est jamais appelé directement. Utilisez {@link
 * lfw.Component}
 * @constructor
 * @param {string} name the optional name of the component.
 */
function Component(name) {
  this.name = name;
  this.controllers = [];
  this.decorators = [];
  this.path = undefined;
}

/**
 * Finalise l'objet Component
 * @private
 * @param {Application} application L'application parente.
 */
Component.prototype.bless = function(application) {
  this.application = application;
}

Component.prototype.config = function(fn) {
  this.initialize = fn;
  return this;
}

/**
 * Callback de rendu d'une vue.
 * @callback Component~renderCallback
 * @param {Error} error Une erreur est survenue.
 * @param {String} render Le rendu de la vue.
 */

/**
 * Effectue le rendu d'une vue du composant.
 * @param {String} view Le nom de la vue dans le dossier ./views
 * @param {Object} data Les données à injecter dans la vue
 * @param {String} format Le format cible (html par défaut)
 * @param {Component~renderCallback} callback La callback
 */
Component.prototype.render = function(view, data, format, callback) {
  if (_.isFunction(format)) {
    callback = format;
    format = 'html';
  }
  var transport = this.application.transport[format];
  if (!transport) return callback(new Error('No transport for '+format));
  transport.renderView(this, view, data, callback);
}

Component.prototype.controller = function(path, fn) {
  if (typeof path === 'function') {
    fn = path;
    path = undefined;
  }
  var controller = new Controller(path);
  fn.apply(controller);
  controller.bless(controller, this);
  this.controllers.push(controller);
  return this;
}


/**
 * Enregistre les décorateurs présents dans le composant.
 * @param {Component} component le composant parent
 * @param {SimpleCallback} next la callback de retour.
 * @private
 */
Component.prototype.decorator = function(component, next) {
  var self = this;
  var path = lassi.fs.join(component.path, "decorators");
  lassi.fs.readdir(path, function(error, files) {
    if (error) {
      if (error.code == 'ENOENT') return next();
      return next(error);
    }
    files.forEach(function(file) {
      var decorator = require(lassi.fs.join(path, file))
      var assertName = 'decorator'+' ('.white+file.yellow+')';
      should.not.empty(decorator, assertName+" can't be empty.");
      decorator = self.bless(decorator, file, component);
      component.decorators.push(decorator);
      self.emit('loaded', 'decorator', decorator.name, decorator);
    });
    next();
  });
}

Component.prototype.entity = function(entity) {
  if (!this.entities) {
    should.not.empty(this.settings.entities, 'No settings for entities found in configuration.');
    this.entities = new lfw.entities.Manager(this.settings.entities);
    this.emit('loaded', 'part', 'Entities', this.entities);
  }
  entity = this.bless(entity, this.entities);
  this.entities.register(entity);
  return this;
}

Component.prototype.service = function() {
  return this.application.service.apply(this.application.mainComponent, arguments);
}

module.exports = Component;
