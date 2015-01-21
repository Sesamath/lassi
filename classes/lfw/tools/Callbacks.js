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

/** timeout mis en dur ici car lfw.application.config pas dispo quand on a besoin du timeout */
var GLOBAL_TIMEOUT = 1000

var flow = require('seq');
var _ = require('underscore')._;

lassi.Class('lfw.tools.Callbacks', {
  /**
   * Classe de gestion des callbacks.
   * @param {Callback~Task[]} callbacks Une liste optionnelle de callbacks
   *
   * @constructor
   */
  construct: function(callbacks) {
    this._callbacks = [];
    if (callbacks) {
      if (!_.isArray(callbacks)) callbacks = [ callbacks ];

    }
  },

  /**
   * Lance l'exécution des callbacks.
   * @param {Object=} globalContext Le contexte d'exécution des callbacks.
   * @param {SimpleCallback} next la callback de retours.
   */
  execute : function(globalContext, next) {
    var __this = this;

    // Recherche d'un context global aux callbacks
    if (_.isUndefined(next)) {
      next = globalContext;
      globalContext = undefined;
    }
    if (this._callbacks.length===0) return next();

    // Accumulateur des résultats de callbacks
    var results = {};

    flow(this._callbacks)
      .seqEach(function(callback) {
        var _this = this;
        var name = callback.__options__.description || callback.name || __this.name;
        var context = callback.__options__.context || globalContext || {} ;
        var timeout = callback.__options__.timeout || GLOBAL_TIMEOUT;
        var timer = setTimeout(function() {
          timer = null;
          _this(new Error('Timeout while executing '+name +' ('+timeout+'ms)'));
        }, timeout);

        function processResult(error, result) {
          // Si le timer est null ici, c'est que le timeout c'est déjà réalisé
          // avant que le fonction ne réponde, donc tant pis pour elle et son
          // résultat...
          if (!timer) {
            lassi.log.error('Attention, un résultat est arrivé sur '+name+' hors du temps impartis. Il est donc ignoré...');
            return;
          }
          clearTimeout(timer);
          delete context._next;
          if (typeof result === 'undefined' && !(error instanceof Error)) {
            result = error;
            error = null;
          }
          if (_.isObject(result)) {
            lassi.tools.update(results, result);
          }
          _this(error);
        }

        try {
          context._next = processResult;
          var result;
          switch(callback.length) {
            case 0: // pas d'arguments => on utilise return en mode synchrone
              result = callback.call(context);
              break;

            case 1: // C'est une callback en seul paramètre
              result = callback.call(context, processResult);
              break;

            case 2: // callback(context, next).
              result = callback.call(context, context, processResult);
              break;
          }
          // Si la callback renvoie un résultat, on part du principe que c'est
          // un résultat synchrone.
          if (callback.length===0 || _.isObject(result)) {
            processResult(null, result);
          }
        } catch(e) {
          processResult(e);
        }
      })
    .seq(function() { next(null, results); })
    .catch(function(error) {
      if (globalContext && globalContext.status && globalContext.status==666) {
         next();
      } else {
        next(error);
      }
    })
  },

  /**
   * Une callback Lassi
   * @callback Callbacks~Task
   * @param {context=} context Le contexte d'exécution de la callback. Dans tous
   * les cas, le context sera utilisé comme scope d'exécution de la callback, ce
   * qui veut dire qu'au sein de celle-ci, le `this` sera une référence sur le
   * contexte.
   * @param {Callbacks~Done=} done La callback de retour. Si elle n'est pas dans
   * la liste des arguments, c'est le return de la callback qui sera utilisé.
   */

  /**
   * Une callback de retour d'une callback.
   * @callback Callbacks~Done
   * @param {Error}  error L'erreur associé au traitement. Si cette erreur n'est pas
   * de type Error, le système l'utilisera comme résultat.
   * @param {Object=} result Le résultat du traitement;
   */

  /**
   * Ajout d'une callback à la pile.
   *
   * @param {Callbacks~Task} callback La callback.
   * @param {Object} options context: Le contexte d'exécution de la callback.
   * Sera utilisé en paramêtre et en this, description: Une description de la
   * callback, timeout: un timeout.
   */
  do : function(callback, options) {
    lassi.assert.function(callback);
    callback.__options__ = options || {};
    this._callbacks.push(callback);
  },

  /**
   * Nombre de callbacks.
   * @return {Integer} nombre
   */
  length : function() {
    return this._callbacks.length;
  }
});
