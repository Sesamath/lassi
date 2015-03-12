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

/**
 * Callback d'une action.
 * @callback Action~callback
 * @param {Context} context
 */

/**
 * Constructeur de l'action.
 * @param {string} path le chemin (ou la partie de chemin) associée à l'action
 * @constructor
 * @private
 */
function Action(controller, methods, path, cb) {
  this.path = path;
  this.methods = methods;
  if (_.isString(cb)) {
    this.fsPath = cb;
    this.callback = undefined;
    this.middleware = true;
  } else {
    this.callback = cb;
    this.middleware = undefined;
  }
  if (this.path && this.path.trim()==='') this.path=undefined;


  if (typeof this.path === 'undefined') {
    this.path = controller.path;
  } else if (this.path.charAt(0)!=='/') {
    this.path = controller.path+'/'+this.path;
  }
  this.path = this.path.replace(/\/+/,'/');
  if (this.path !== '/') {
   this.path = this.path.replace(/\/+$/,'');
  }

  if (this.middleware) {
    var express = require('express');
    var serveStatic = express.static(cb);
    this.middleware = (function(base) {
      return function(request, response, next) {
        var saveUrl = request.url;
        request.url = request.url.substr(base.length);
        if (request.url.length===0 || request.url.charAt(0) !== '/') request.url = '/'+request.url;
        serveStatic(request, response, function() {
          request.url = saveUrl;
          next();
        });
      }
    })(this.path);
    this.path += '*';
  }

  this.pathRegexp = pathtoRegexp(this.path, this.keys = [], { sensitive: true, strict: true, end: false });
  lassi.log(
    'lassi',
    (this.methods?this.methods.join(','):'ALL').blue,
    this.path.yellow,
    this.pathRegexp,
    this.middleware?' -> '+cb:''
   );
}

/**
 * Fonction fauchée ici : http://forbeslindesay.github.io/express-route-tester/
 * car le module https://github.com/component/path-to-regexp marche finalement
 * moins bien...
 */
function pathtoRegexp(path, keys, options) {
  options = options || {};
  var sensitive = options.sensitive;
  var strict = options.strict;
  keys = keys || [];

  if (path instanceof RegExp) return path;
  if (path instanceof Array) path = '(' + path.join('|') + ')';

  path = path
    .concat(strict ? '' : '/?')
    .replace(/\/\(/g, '(?:/')
    .replace(/\+/g, '__plus__')
    .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function(_, slash, format, key, capture, optional){
      keys.push({ name: key, optional: !! optional });
      slash = slash || '';
      return '' +
          (optional ? '' : slash) +
          '(?:' +
          (optional ? slash : '') +
          (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')' +
          (optional || '');
    })
    .replace(/([\/.])/g, '\\$1')
    .replace(/__plus__/g, '(.+)')
    .replace(/\*/g, '(.*)');

  return new RegExp('^' + path + '$', sensitive ? '' : 'i');
}

/**
 * Vérifie si une route est gérée par le contrôleur
 * @param path La route à tester
 * @returns {array} Les paramètres de la route qui correspondent au pattern du contrôleur
 */
Action.prototype.match = function(method, path){
  var params = {};
  var key;
  var val;


  method = method.toLowerCase();
  if (this.methods && !_.contains(this.methods, method)) return null;
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
}

/**
 * Lance l'exécution de la pile de callbacks
 * @param {Context} context
 * @param {Function} next
 */
Action.prototype.execute = function(context, next) {
  var GLOBAL_TIMEOUT = 1000

  var timeout = GLOBAL_TIMEOUT;
  var timer = setTimeout(function() {
    timer = null;
    next(new Error('Timeout while executing ('+timeout+'ms)'));
  }, timeout);

  function processResult(error, result) {
    // Si le timer est null ici, c'est que le timeout c'est déjà réalisé
    // avant que le fonction ne réponde, donc tant pis pour elle et son
    // résultat...
    if (!timer) {
      console.log('Attention, un résultat est arrivé hors du temps impartis. Il est donc ignoré...');
      return;
    }
    clearTimeout(timer);
    delete context.next;
    if (typeof result === 'undefined' && !(error instanceof Error)) {
      result = error;
      error = null;
    }
    next(error, result);
  }

  try {
    context.next = processResult;
    this.callback.call(context, context);
  } catch(e) {
    processResult(e);
  }
}

module.exports = Action;
