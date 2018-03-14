'use strict'
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
var _ = require('lodash')
var log = require('an-log')('lassi-actions')
var constantes = require('./constantes')
// sera initialisé d'après les settings au 1er appel d'un contrôleur
var maxTimeout

/**
 * Fonction fauchée ici : http://forbeslindesay.github.io/express-route-tester/
 * car le module https://github.com/component/path-to-regexp marche finalement
 * moins bien...
 */
function pathtoRegexp (path, keys, options) {
  options = options || {}
  var sensitive = options.sensitive
  var strict = options.strict
  keys = keys || []

  if (path instanceof RegExp) return path
  if (path instanceof Array) path = '(' + path.join('|') + ')'

  path = path
    .concat(strict ? '' : '/?')
    .replace(/\/\(/g, '(?:/')
    .replace(/\+/g, '__plus__')
    .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function (_, slash, format, key, capture, optional) {
      keys.push({ name: key, optional: !!optional })
      slash = slash || ''
      return '' +
          (optional ? '' : slash) +
          '(?:' +
          (optional ? slash : '') +
          (format || '') + (capture || ((format && '([^/.]+?)') || '([^/]+?)')) + ')' +
          (optional || '')
    })
    .replace(/([/.])/g, '\\$1')
    .replace(/__plus__/g, '(.+)')
    .replace(/\*/g, '(.*)')

  return new RegExp('^' + path + '$', sensitive ? '' : 'i')
}

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
class Action {
  constructor (controller, methods, path, cb) {
    if (!_.isFunction(cb)) {
      if (!_.isObject(cb)) throw new Error('invalid cb passed to Action constructor')
      // c'est un objet, on l'ajoute
      Object.assign(this, cb)
      this.callback = undefined
      this.middleware = true
    } else {
      this.callback = cb
      this.middleware = undefined
    }
    this.path = path
    this.methods = methods
    if (this.path && this.path.trim() === '') this.path = undefined

    if (typeof this.path === 'undefined') {
      this.path = controller.path
    } else if (this.path.charAt(0) !== '/') {
      this.path = controller.path + '/' + this.path
    }
    this.path = this.path.replace(/\/+/, '/')
    if (this.path !== '/') {
      this.path = this.path.replace(/\/+$/, '')
    }

    if (this.middleware) {
      var express = require('express')
      var options = {}
      if (lassi.settings && lassi.settings.pathProperties && lassi.settings.pathProperties[this.path]) {
        Object.assign(options, lassi.settings.pathProperties[this.path])
      }
      // par défaut, express met un max-age à 0 (cf http://expressjs.com/en/4x/api.html#express.static)
      // si l'appli ne précise rien on le met à 1h sur le statique
      if (!options.hasOwnProperty('maxAge')) options.maxAge = '1h'
      var serveStatic = express.static(this.fsPath, options)
      this.middleware = (function (base) {
        return function (request, response, next) {
          var saveUrl = request.url
          request.url = request.url.substr(base.length)
          if (request.url.length === 0 || request.url.charAt(0) !== '/') request.url = '/' + request.url
          serveStatic(request, response, function () {
            request.url = saveUrl
            next()
          })
        }
      })(this.path)
      this.path += '*'
    }

    this.pathRegexp = pathtoRegexp(this.path, this.keys = [], { sensitive: true, strict: true, end: false })
    log('Add route',
      (this.methods ? this.methods.join(',') : 'ALL').toUpperCase(),
      this.path.yellow,
      this.pathRegexp,
      this.middleware ? ' -> ' + cb : ''
    )
  }

  /**
   * Vérifie si une route est gérée par le contrôleur
   * @param path La route à tester
   * @returns {Object} Les paramètres de la route qui correspondent au pattern du contrôleur
   */
  match (method, path) {
    var params = {}
    var key
    var val

    method = method.toLowerCase()
    if (this.methods && !this.methods.includes(method)) return null
    var match = this.pathRegexp.exec(path)
    // console.log(path, this.pathRegexp, match);
    if (!match) return null

    var paramIndex = 0
    var len = match.length
    for (var i = 1; i < len; ++i) {
      key = this.keys[i - 1]
      try {
        val = typeof match[i] === 'string' ? decodeURIComponent(match[i]) : match[i]
      } catch (e) {
        var err = new Error("Failed to decode param '" + match[i] + "'")
        err.status = 400
        throw err
      }

      if (key) {
        params[key.name] = val
      } else {
        params[paramIndex++] = val
      }
    }

    return params
  }

  /**
   * Lance l'exécution de la pile de callbacks
   * @param {Context} context
   * @param {Function} next
   */
  execute (context, next) {
    var timer = false
    var isCbCompleted = false

    function fooProtect () {
      console.error('Attention, un résultat est arrivé de manière inatendue (un appel de next en trop ?).')
      console.trace()
    }
    function processResult (error, result) {
      context.next = fooProtect
      isCbCompleted = true
      if (timer) clearTimeout(timer)
      if (typeof result === 'undefined' && !(error instanceof Error)) {
        result = error
        error = null
      }
      next(error, result)
    }

    try {
      // on ne peut pas appeler $settings ou lassi.service en dehors de la classe car ce fichier est requis
      // avant bootstrap, on initialise donc maxTimeout lors du 1er appel d'un controleur après le boot
      if (!maxTimeout) {
        var $settings = lassi.service('$settings')
        maxTimeout = $settings.get('$server.maxTimeout', constantes.maxTimeout - constantes.minDiffTimeout)
      }
      context.next = processResult

      this.callback.call(context, context)

      // Timeout de 1s par défaut après le retour synchrone
      // (ça permet aussi à l'action de modifier son timeout pendant son exécution)
      var timeout = context.timeout || this.callback.timeout || constantes.defaultTimeout
      if (timeout > maxTimeout) {
        console.error(new Error(`timeout ${timeout} supérieur au maximum autorisé dans cette application ${maxTimeout}, il sera ramené à ${maxTimeout - constantes.minDiffTimeout}`))
        // pour laisser le timeout ci-dessous prendre la main sur celui de node
        timeout = maxTimeout - constantes.minDiffTimeout
      }

      // Si aucune donnée synchrone n'est déjà reçue, on arme le timeout
      if (!isCbCompleted) {
        timer = setTimeout(function () {
          timer = false
          next(new Error('Timeout while executing (' + timeout + 'ms)'))
        }, timeout)
      }
    } catch (e) {
      processResult(e)
    }
  }
}

module.exports = Action
