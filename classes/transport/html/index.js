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
var EventEmitter = require('events').EventEmitter
var util         = require('util');
var pathlib = require('path');

/**
 * Gestion du transport HTML.
 * @param {Application} application L'application parente
 * @extends Emitter
 */
function HtmlTransport(application) {
  // Initialisation du mixin Emitter
  this.application = application;
  this.engine = new Renderer();
}
util.inherits(HtmlTransport, EventEmitter)

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
  self.emit('metas', metas);
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


/**
* Prend en charge une erreur survenue au cours du traitement de l'action.
* @param {Context} context Le contexte de l'action.
* @param {Object} error Un objet décrivant le contexte de l'erreur.
*/
HtmlTransport.prototype.manageError = function(context, error) {
  var output;

  if (this.application.staging == lassi.Staging.development) {
    if (error.error)
      error.error = "<pre>" + util.inspect(error.error) + "</pre>";
    error.message = "<span style='color: #750000'><b>" + error.message + "</b></span>";
    if (error.stack)
      for (var i in error.stack) {
        error.stack[i] =
          '<tr>' +
          '<td align="right" class="module"><pre>' +
          // function n'existe pas toujours (TypeError: Cannot call method 'replace' of undefined)
          (error.stack[i].function ? error.stack[i].function.replace('<', '&lt;').replace('>', '&gt;') : '') +
          '</pre></td>' +
          '<td class="file">' + error.stack[i].file + '</td>' +
          '<td class="line">' + error.stack[i].line + '</td>' +
          '</tr>';
      }
      error.stack = "<table class='stack'>" + error.stack.join('') + "</table>";

      output = '<style>';
      output += '.line { color: #799B23; font-weight:bold }';
      output += '.module { color: #799B23; font-weight:bold }';
      output += 'table.error>tbody>tr>td>pre { padding: 5px;}';
      output += 'table { border-collapse: collapse}';
      output += 'table.error>tbody>tr>td { border: 1px solid #E0E0E0; padding: 2px 10px}';
      output += 'table.stack>tbody>tr>td { border-bottom: 1px dashed #E0E0E0; padding: 2px 10px}';
      output += '</style>';
      output += '<table class="error">';
      _.each(error, function (value, key) {
        output += '<tr><td align="right" valign="top"><b>' + key + '</b></td><td>' + value + '</td></tr>';
      })
      output += '</table>';
  } else {
    output = "Something went wrong, please contact <a href='mailto://"+this.application.mail+"'>the administrator</a>.";
  }
  context.response.send(500, output);
  return true;
}

module.exports = HtmlTransport;
