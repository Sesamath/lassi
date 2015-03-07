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
var Context      = require('./Context');
var EventEmitter = require('events').EventEmitter
var util         = require('util');
var Component    = require('./Component');
var Controller   = require('./Controller');
var flow         = require('seq');

/**
 * La classe controller est le chef d'orchestre de lassi. Elle gère
 * l'arrivée des requêtes, détermine les actions qui y répondent et
 * la couche de transport à utiliser pour répondre.
 * @constructor
 * @extends Emitter
 */
function Controllers(application) {
  var self = this;
  this.application = application;
  this.actions = [];
  _.each(application.components, function(component) {
    _.each(component.controllers, function(controller) {
      controller.actions.forEach(function(action) {
        self.actions.push(action);
      });
    });
  });

  this.fakeComponent = new Component('fake');
  this.fakeComponent.bless(application, 'fake', 'fake', {});
  this.fakeController = new Controller();
  this.fakeController.bless('', this.fakeComponent);
  this.errorActions = {
    404: this.fakeController.Action('404').do(function notFound(context) {
      context.notFound();
    }).bless(this.fakeController)
  }
}
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
    request.data = {};
    if (!request.parsedUrl) request.parsedUrl = parse(request.url);

    var context = new Context(request, response);
    context.contentType = 'application/json';
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
          if (error) return next(error);
          if (typeof result=='object') {
            _.extend(data, result);
          } else {
            data = result;
          }
          if (action.action.controller._renderAs) {
            _.extend(data, action.action.controller._renderAs);
          }
          if (result.$metas) {
            data.$metas = data.$metas || {};
            _.extend(data.$metas, result.$metas);
          }
          nextAction();
        });
      }
    })
    .seq(function() {
      if (!self.application.transports[data.$contentType]) {
        data.$contentType = undefined;
      }
      if (data.$contentType) {
        if (data.content) {
          data.$contentType = 'text/html';
        } else if (typeof data === 'string') {
          data.$contentType = 'text/plain';
        } else {
          data.$contentType = 'application/json';
        }
      }
      var transport = self.application.transports[data.$contentType];
      transport.process(data, this);
    })
    .seq(function(content) {
      context.response.setHeader('Content-Type', data.$contentType);
      context.response.send(content);
    })
    .catch(next);
  }
}



module.exports = Controllers;
