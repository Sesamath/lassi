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
    request.data = {};
    if (!request.parsedUrl) request.parsedUrl = parse(request.url);

    var context = new Context(request, response);
    var actions = [];
    var params;
    _.each(self.actions, function(action) {
      if (params = action.match(request.method, request.parsedUrl.pathname)) {
        actions.push({action: action, params: params});
      }
    });

    var data = {};
    flow(actions)
    .seqEach(function(action) {
      var nextAction = this;
      context.arguments = action.params;

      if (action.action.middleware) {
        action.action.middleware(request, response, function() { nextAction();  });
      } else {
        action.action.execute(context, function(error, result) {
          result = result || {};
          if (error) return next(error);
          if (typeof result=='object') {
            _.extend(data, result);
          } else {
            data = result;
          }
          if (result.$metas) {
            data.$metas = data.$metas || {};
            _.each(result.$metas, function(v,k) {
              if (k=='css' || k=='js') {
                if (!_.isArray(v)) v = [ v ];
                data.$metas[k] = data.$metas[k] || [];
                console.log('====', k);
                data.$metas[k] = data.$metas[k].concat(v);
              } else {
                data.$metas[k] = v;
              }
            });
          }
          if (context.status) {
            data.$status = context.status;
            data.content = context.message;
            data.$location = context.location;
          }
          nextAction();
        });
      }
    })
    .seq(function() {
      console.log(data);
      data.$contentType = data.$contentType || 'text/plain';
      /*
      if (!lassi.transports[data.$contentType]) {
        data.$contentType = undefined;
      }
      if (data.$contentType) {
        if (data.$status) {
          data.$contentType = 'text/plain';
        } else if (data.content) {
          data.$contentType = 'text/html';
        } else {
          data.$contentType = 'application/json';
        }
      }*/
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
