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
var _            = require('lodash');
var Context      = require('./Context');
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
      // Si une erreur s'est produite plus haut dans la chaîne, on n'exécute pas
      // les actions suivantes.
      if (context.error) return this();

      var nextAction = this;
      context.arguments = actionnable.params;

      // L'actionnable est un middleware
      if (actionnable.action.middleware) {
        actionnable.action.middleware(request, response, function() { nextAction();  });

      // L'acttionnable est une action
      } else {
        actionnable.action.execute(context, function(error, result) {
          if (error) {
            context.error = error;
            return nextAction();
          }

          result = result || {};

          // Si le résultat et une simple chaîne, on la transforme en content et on affecte
          // un content type adapté
          if (typeof result === 'string') {
            context.contentType = context.contentType || 'text/plain';
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
      if (!context.error) {
        //console.log(context.contentType, context.status, context.error, data);
        // Cas d'une redirection, on passe en fast-track
        if (context.location) this();

        // Content type par défaut
        context.contentType = context.contentType || 'text/plain';

        // Si on n'a pas reçu de contenu => 404
        if (!context.status && _.isEmpty(data)) {
          context.status = 404;
          data.content = 'not found '+context.request.url;
          context.contentType = 'text/plain';
        }
      }
      lassi.emit('beforeTransport', context, data);

      // Si une erreur s'est produite et que rien n'a été fait dans l'event, on envoie
      // une erreur standard
      if (context.error) {
        var head = context.error.toString();
        lassi.log('Lassi', head.red, context.error.stack.toString().replace(head, ''));
        context.contentType = 'text/plain';
        context.status = 500;
        data.content = 'Server Error';
      }

      // Sélection du transport et processing
      if (!context.contentType) return this(new Error('No content type defined'));
      var transport = lassi.transports[context.contentType];
      if (!transport) return this(new Error('No renderer found for contentType:'+context.contentType));
      transport.process(data, this);
    })

    .seq(function(content) {
      if (context.status) {
        context.response.status(context.status);
        if (context.status > 300 && context.status < 400) {
          context.response.redirect(context.location);
          return;
        }
      }
      context.response.setHeader('Content-Type', context.contentType);
      context.response.send(content);
    })
    .catch(next);
  }
}



module.exports = Controllers;
