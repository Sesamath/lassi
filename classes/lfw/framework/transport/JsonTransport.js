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



lassi.Class('lfw.framework.transport.JsonTransport', {

  // constructeur
  construct: function (application) {
    this.application = application;
  },
  process: function(context, next) {
    var action = context.action;
    var _this = this;
    if (action.constructor.name == 'Action') {
      action.execute(context, function(error, data) {
        if (error) return next(error);
        _this.send(context, data)
        next();
      });
    } else {
      next(new Error('why do I have to process '+action.constructor.name+'['+action.name+'] in a JSON transport ?'))
    }
  },

  /**
   * Prend en charge une erreur survenue au cours du traitement de l'action.
   */
  manageError: function() {
    return false;
  },

  /**
   * Helper pour la réponse, envoie du json, ou du js (jsonp) si on trouve un param callback ou jsonp en get
   * @param context
   * @param data
   */
  send: function (context, data) {
    if(context.status) {
      context.response
        .status(context.status)
        .send({ok:false, message: context.message});
      return;
    }
    var callbackName = context.get.callback || context.get.jsonp
    var isJsonP = !!callbackName
    var jsonString
    try {
      if (context.application.staging == lassi.Staging.development)
        // en dev on aère un peu la sortie pour la rendre lisible
        jsonString = JSON.stringify(data, null, 2)
        else jsonString = JSON.stringify(data)
    } catch (error) {
      jsonString = "{error:" +error.toString() +"}";
    }

    if (isJsonP) {
      context.response.set('Content-Type', 'application/javascript; charset=utf-8');
      context.response.send(callbackName + '(' + jsonString + ')');
    } else {
      context.response.set('Content-Type', 'text/html' /* à cause de chrome... application/json'*/);
      context.response.send(jsonString);
    }
  }
});
