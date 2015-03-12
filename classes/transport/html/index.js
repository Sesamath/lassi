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
var flow = require('seq');
var util = require('util');
var Renderer = require('./Renderer');
var Metas = require('./Metas');
var pathlib = require('path');

/**
 * Gestion du transport HTML.
 */
function HtmlTransport() {
  this.engine = new Renderer();
}

/**
* Définit le layout à appliquer lorsque décorateurs et action sont
* exécutés.
*
* @param {String} layout Le nom du layout
* @param {Component} component Le composant qui est chargé du rendu du layout
* @param {String} view La vue à utiliser pour le rendu
*/

/**
* Helper de rendu d'une vue via un composant.
*
* @param {Component} component le composant
* @param {String} view la vue
* @param {Object} data le context de rendu
* @param {SimpleCallback} next la callback de retour
* @private
*/
HtmlTransport.prototype.process = function(data, next) {
  var self = this;
  var sections = _.filter(_.keys(data), function(i) { return i.charAt(0)!=='$' });
  var metas = new Metas(data.$metas || {});
  flow(sections)
    .seqEach(function(key) {
      if (key.charAt[0]==='$') return this();
      var next = this;
      var view = data[key].$view || key;
      self.engine.render(data.$views, view, data[key], function(error, result) {
        if (error) return next(error);
        data[key] = result;
        next();
      });
    })
    .seq(function() {
      var next = this;
      data.head = metas.head().render();
      data.breadcrumbs = metas.breadcrumbs;
      data.pageTitle = metas.pageTitle;

      self.engine.render(data.$views, data.$layout, data, function(error, result) {
        if (error) return next(error);
        next(null, result);
      });
    })
    .seq(function(output) { next(null, output); }).catch(next);
}

module.exports = HtmlTransport;
