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

var Controller = require('./Controller');
var _            = require('lodash');

/**
 * Construction d'un composant.
 * Ce constructeur n'est jamais appelé directement. Utilisez {@link Lassi#component}
 * @constructor
 * @param {string} name Le nom du composant.
 * @param {array} dependencies Dépendances
 */
function Component(name, dependencies) {
  this.name         = name;
  this.controllers  = [];
  this.dependencies = dependencies;
  this.entities     = {};
  this.services     = {};
  this.path         = undefined;
  this.userConfig   = [];
}

/**
 * Ajoute un configurateur au composant.
 * @param {Function} fn le configurateur.
 * @return {Component} chaînable
 */
Component.prototype.config = function(fn) {
  this.userConfig.push(fn);
  return this;
}

/**
 * Configuration du composant
 */
Component.prototype.configure = function() {

  // Si on est déjà configuré, on repart
  if (this.configured) return;

  var self = this;
  _.each(self.dependencies, function(dependency) {
    var component = lassi.components[dependency];
    component.configure();
  });
  _.each(self.services, function(service, name) {
    lassi.services.register(name, service);
  });
  _.each(self.entities, function(entity, name) {
    var cons = (function(name, entity) {
      return function($entities) {
        var def = $entities.define(name);
        lassi.services.parseInjections(entity, def);
        def.setup = function(cb) {
          $entities.initializeEntity(def, cb);
        }
        return def;
      }
    })(name, entity);
    lassi.services.register(name, cons);
  });
  _.each(self.controllers, function(fn, name) {
    var controller = new Controller(fn.$$path);
    lassi.services.parseInjections(fn, controller);
    self.controllers[name] = controller;
  });

  _.each(self.userConfig, function(userConfig) {
    lassi.services.parseInjections(userConfig, self);
  });
  this.configured = true;
  lassi.log('initialized', this.name);
}

/**
 * Définition d'un controleur dans le composant.
 * @param {String} [path] le chemin des actions de ce contrôleur.
 * @param {function} fn La fonction du controleur.
 * @return {Component} chaînable
 */
Component.prototype.controller = function(path, fn) {
  if (typeof path === 'function') {
    fn = path;
    path = undefined;
  }
  fn.$$path = path;
  this.controllers.push(fn);
  return this;
}

/**
 * Ajoute une {@link EntityDefinition} au composant.
 * @param {String} name le nom de l'entité.
 * @param {Function} fn La fonction de l'entité
 * @return {Component} chaînable
 */
Component.prototype.entity = function(name, fn) {
  this.entities[name] = fn;
  return this;
}

/**
 * Définition d'un service.
 * @param String name Le nom du service.
 * @param function name Le service (paramètres injectables).
 * @return Lassi chaînable
 */
Component.prototype.service = function(name, fn) {
  this.services[name] = fn;
  return this;
}

/**
 * Démarre l'application.
 * @fires Lassi#bootstrap
 */
Component.prototype.bootstrap = function() {
  lassi.bootstrap(this);
}

module.exports = Component;
