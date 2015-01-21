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

lassi.Class('lfw.framework.Controllers', {
  mixins: [lassi.Emitter],

  /**
   * La classe controller est le chef d'orchestre de lassi. Elle gère
   * l'arrivée des requêtes, détermine les actions qui y répondent et
   * la couche de transport à utiliser pour répondre.
   * @constructor
   * @extends EventEmitter
   */
  construct: function (application) {
    var _this = this;
    this.application = application;
    this.actions = [];
    this.decorators = [];
    for (var componentName in application.components) {
      var component = application.components[componentName];
      component.controllers.forEach(function(controller) {
        controller.actions.forEach(function(action) {
          _this.actions.push(action);
        });
      });
      component.decorators.forEach(function(decorator) {
        _this.decorators.push(decorator);
      });
    }

    this.fakeComponent = new lfw.framework.Component('fake');
    this.fakeComponent.bless(application, 'fake', 'fake', {});
    this.fakeController = lassi.Controller().respond('html');
    this.fakeController.bless('', this.fakeComponent);
    this.errorActions = {
      404: this.fakeController.Action('404').do(function notFound(ctx, next) {
        ctx.notFound();
      }).bless(this.fakeController)
    }
  },
 /**
  * Génération du middleware Express.
  * @return {Function} Le middleware
  */
  middleware: function() {
    var _this = this;

    /**
     * Le middleware.
     * @fires Controllers#request
     */
    return function(request, response, next) {
      request.data = {};
      if (!request.parsedUrl) request.parsedUrl = parse(request.url);

      var context;
      var params;
      var action;

      for(var i=0; i < _this.actions.length; i++) {
        action = _this.actions[i];
        if (params = action.match(request.method, request.parsedUrl.pathname)) {
          context = new lfw.framework.Context(action, request, response, params)
          break;
        }
      }
      if (!context) {
        context = new lfw.framework.Context(_this.errorActions[404], request, response, {});
      }

      /**
       * Évènement déclenché lors de l'arrivée d'une requête.
       * @event Controllers#request
       * @param {lfw.framework.Context}  context Le contexte de la requête
       */
      _this.emit('request', context);

      var transports = _.keys(context.action.controller.responses);
      if (transports.length===0) return next(new Error('No response transport assigned to this action controller'));
      context.responseFormat = context.get.format?context.get.format:transports[0];
      var transport = _this.application.transports[context.responseFormat];
      if (!transport) return next(Error('No transport for '+context.responseFormat));
      context.transportSettings = context.action.controller.responses[context.responseFormat];
      if (!context.transportSettings) return next(Error('No transport settings for '+context.responseFormat));

      // Sauvegarde pour ErrorHandler
      request.__context = context;
      request.__transport = transport;


      transport.process(context, function(error) {
        lassi.log.info(
          request.method.blue, request.parsedUrl.pathname.green,
          '➠',
          context.component.name.red+ 
            '['+context.action.methods.join(',').yellow+', '+context.action.pathRegexp+']',
          '➠',
          (context.status+'').yellow+(error?'['+error.message+']':'')
        );
        if (context.status && context.status >= 300 && context.status < 400) {
          response.redirect(context.location);
        } else {
          if (error) return next(error);
        }
      });
    }
  }
});

