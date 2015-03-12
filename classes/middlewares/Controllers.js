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

var parse        = require('url').parse;
var _            = require('underscore')._;
var Context      = require('../Context');
var EventEmitter = require('events').EventEmitter
var util         = require('util');
var flow         = require('seq');

/**
 * La classe controller est le chef d'orchestre de lassi. Elle gère
 * l'arrivée des requêtes, détermine les actions qui y répondent et
 * la couche de transport à utiliser pour répondre.
 * @constructor
 * @private
 * @extends Emitter
 */
function Controllers() { }
util.inherits(Controllers, EventEmitter)

function merge(a,b) {
  _.each(b, function(v, k) {
    if (_.isArray(a[k])) {
      a[k] = a[k].concat(v);
    } else if (typeof a[k] === 'object') {
      merge(a[k],v);
    } else {
      a[k] = v;
    }
  });
}

/**
* Génération du middleware Express.
* @return {Function} Le middleware
*/
Controllers.prototype.middleware = function() {
  var self = this;

  /**
   * Le middleware.
   * @fires Controllers#request
   */
  return function(request, response, next) {

    // Première entrées, on collectionne toutes les actions
    // disponibles
    if (!self.actions) {
      self.actions = [];
      _.each(lassi.components, function(component) {
        _.each(component.controllers, function(controller) {
          _.each(controller.actions, function(action) {
            self.actions.push(action);
          });
        });
      });
    }

    // Parsing de l'url
    if (!request.parsedUrl) request.parsedUrl = parse(request.url);

    // Génération du contexte
    var context = new Context(request, response);

    // Sélection des actions déclenchables
    var params, actionnables = [];
    _.each(self.actions, function(action) {
      if (params = action.match(request.method, request.parsedUrl.pathname)) {
        actionnables.push({action: action, params: params});
      }
    });

    // Espace de stockage des résultats
    var data = {};

    // Séquencement des actions
    flow(actionnables)
    .seqEach(function(actionnable) {
      var nextAction = this;
      context.arguments = actionnable.params;

      // L'actionnable est un middleware
      if (actionnable.action.middleware) {
        actionnable.action.middleware(request, response, function() { nextAction();  });

      // L'acttionnable est une action
      } else {
        actionnable.action.execute(context, function(error, result) {
          if (error) return next(error);

          result = result || {};

          // Status : 40X,30X
          if (context.status) {
            data.$contentType = data.$contentType || 'text/plain';
            data.$status = context.status;
            data.content = context.message;
            data.$location = context.location;
          }

          // Si le résultat et une simple chaîne, on la transforme en content et on affecte
          // un content type adapté
          else if (typeof result === 'string') {
            data.$contentType = data.$contentType || 'text/plain';
            data.content = result;
          }

          // Cas général d'un retour objet à merger
          else {
            merge(data, result);
          }

          nextAction();
        });
      }
    })
    .seq(function() {
      // Cas d'une redirection, on passe en fast-track
      if (data.$location) {
        response.redirect(data.$location);
        return;
      }

      // Content type par défaut
      data.$contentType = data.$contentType || 'text/plain';

      // Si on n'a pas reçu de contenu => 404
      if ((data.$contentType==='text/html' || data.$contentType==='text/plain') && !data.content) {
        data.$status = 404;
        data.content = 'not found';
        data.$contentType = 'text/plain';
      }

      lassi.emit('beforeTransport', data);
      var transport = lassi.transports[data.$contentType];
      transport.process(data, this);
    })
    .seq(function(content) {
      if (data.$status) {
        context.response.status(data.$status);
        if (data.$status > 300 && data.$status < 400) {
          context.response.redirect(data.$location);
          return;
        }
      }
      context.response.setHeader('Content-Type', data.$contentType);
      context.response.send(content);
    })
    .catch(next);
  }
}



module.exports = Controllers;
