'use strict';
/*
 * @preserve This file is part of "lassi".
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
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var _ = require('underscore')._;

lassi.Class('lfw.framework.Action', {
  /**
   * Constructeur de l'action.
   * @param {string} path le chemin (ou la partie de chemin) associée à l'action
   * @constructor
   */
  construct: function (path, name) {
    this.callbacks      = new lfw.tools.Callbacks();
    this.methods        = ['GET'];
    this.path           = path;
    this.name           = name;
    this.target         = 'content';
  },
  /**
   * Affecte la liste des méthodes http autorisées (à la place du GET par défaut)
   * @returns {Action}
   */
  via : function() {
    this.methods = Array.prototype.slice.call(arguments)
      .map(function(a){return a.toUpperCase()});
    return this;
  },

  /**
   * Affecte la vue à utiliser (sinon c'est celle du même nom que l'action)
   * @param {String} view
   * @returns {Action}
   */
  renderWith : function(view) {
    this.view = view;
    return this;
  },

  /**
   * Ajoute une callback à la pile
   * @param {Function} callback
   * @param {Function} options
   * @returns {Action}
   */
  do : function(callback, options) {
    this.callbacks.do(callback, options);
    return this;
  },

  /**
   * Affecte les propriétés controller, component, path, etc (utilisé par le framework, lors de l'init des controleurs)
   * @param {Controller} controller
   * @returns {Action}
   */
  bless : function(controller) {
    this.controller = controller;
    this.component = controller.component;

    if (_.isUndefined(this.path) || this.path.charAt(0)!=='/') {
      var parts = [];
      if (!_.isUndefined(this.path)) parts.unshift (this.path);
      if (controller.path) parts.unshift(controller.path);
      this.path = '/' + parts.join('/');
    }

    /**
     * ???
     * @type {RegExp}
     */
    this.pathRegexp = lassi.tools.pathtoRegexp(this.path, this.keys = [], { sensitive: true, strict: true, end: false });
    if (!this.name) {
      this.name = lassi.tools.toCamelCase(this.path.replace(/^\//g, '').replace(/\/:[^\/]+/g,'').replace(/\//g, '.'));
    }
    this.view = this.view || this.name.replace('.', '-');

    lassi.tools.register('lassi.action.'+this.name, this);
    return this;
  },

  /**
   * Vérifie si une route est gérée par le contrôleur
   * @param path La route à tester
   * @returns {array} Les paramètres de la route qui correspondent au pattern du contrôleur
   */
  match : function(method, path){
    var params = {};
    var key;
    var val;

    if (!_.contains(this.methods, method.toUpperCase())) return null;
    var match = this.pathRegexp.exec(path);
    //console.log(path, this.pathRegexp, match);
    if (!match) return null;

    var paramIndex = 0;
    var len = match.length;
    for (var i = 1; i < len; ++i) {
      key = this.keys[i - 1];
      try {
        val = 'string' == typeof match[i] ? decodeURIComponent(match[i]) : match[i];
      } catch(e) {
        var err = new Error("Failed to decode param '" + match[i] + "'");
        err.status = 400;
        throw err;
      }

      if (key) {
        params[key.name] = val;
      } else {
        params[paramIndex++] = val;
      }
    }

    return params;
  },

  /**
   * Lance l'exécution de la pile de callbacks
   * @param {Context} context
   * @param {Function} next
   */
  execute : function(context, next) {
    this.callbacks.execute(context, next);
  },

  /**
   * Renvoie les infos colorées (pour la console)
   * @returns {string}
   */
  toAnsi : function() {
    return this.methods.join('|').yellow+" "+this.path.cyan +
      " >> "+ this.view;
  }
});
