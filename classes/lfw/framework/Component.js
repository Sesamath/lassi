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

var _ = require('underscore')._;

lassi.Class('lfw.framework.Component' , {
  /**
   * Construction d'un composant.
   * Ce constructeur n'est jamais appelé directement. Utilisez {@link
   * lfw.Component}
   * @constructor
   * @param {string} name the optional name of the component.
   */
  construct: function(name, root) {
    this.name = name;
    this.controllers = [];
    this.decorators = [];
    this.commands = [];
    this.root = root || '/';
  },

  /**
   * Finalise l'objet Component
   * @private
   * @param {Application} application L'application parente.
   * @param {String} modulePath Le module parent
   * @param {String} moduleName Le nom du module
   * @param {Object} config La configuration du composant
   */
  bless : function(application, modulePath, moduleName, config) {
    this.application = application;
    this.path = modulePath+"/"+moduleName;
    this.name = lassi.fs.basename(this.path);
    this.settings = config;
    lassi.tools.register('lassi.'+this.name, this);
    return this;
  },

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
  render : function(view, data, format, callback) {
    if (_.isFunction(format)) {
      callback = format;
      format = 'html';
    }
    var transport = this.application.transport[format];
    if (!transport) return callback(new Error('No transport for '+format));
    transport.renderView(this, view, data, callback);
  },

  registerController: function(controllerClass) {
    var assertName = 'controller'+' ('.white+this.name.green+')';
    var controller = new controllerClass();
    lassi.assert.not.empty(controller, assertName+" can't be empty");
    // TODO héritage profond
    //lassi.assert.true(controller.instanceOf(lfw.framework.Controller), assertName+" should be a lassi.Controller instance");
    controller = this.application.bless(controller, 'file', this);
    this.controllers.push(controller);
    lassi.assert.not.empty(controller.actions, 'No action defined in '+assertName);
    return this;
  }
})
