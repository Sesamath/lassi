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

const _ = require('lodash')
const flow = require('an-flow')
// const util = require('util');
const Renderer = require('./Renderer')
const Metas = require('./Metas')
// const pathlib = require('path');
const log = require('an-log')('LassiHtml')

/**
 * Gestion du transport HTML.
 */
function HtmlTransport (lassi) {
  this.engine = new Renderer()
  this.lassi = lassi
}

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
* @param {Object} data les données à rendre
* @param {simpleCallback} next la callback de retour
* @private
*/
HtmlTransport.prototype.process = function (data, next) {
  if (data.$layout === false) return next(null, data.content)
  const self = this
  const sections = Object.keys(data).filter((i) => i.charAt(0) !== '$')
  const metas = new Metas(data.$metas || {})
  flow(sections)
    .seqEach(function (key) {
      // seul les objets sont traités comme des sections et rendus dans des vues dust,
      // les string|number sont passés directement au layout
      if (!_.isObject(data[key])) return this()
      const next = this
      // si $view n'existe pas on prendra le nom de la section
      const view = data[key].$view || key
      // le dossier où chercher view
      const viewsPath = data.$views || lassi.settings.application.defaultViewsPath
      // et on remplace chaque section par son rendu
      if (!_.isString(viewsPath)) {
        log.error('Il semble que le $views de ce data ne soit pas correctement renseigné', data)
        throw new Error('Wrong views path')
      }
      self.engine.render(viewsPath, view, data[key], function (error, result) {
        if (error) return next(error)
        data[key] = result
        next()
      })
    })
    .seq(function () {
      const next = this
      data.head = metas.head().render()
      data.breadcrumbs = metas.breadcrumbs
      data.pageTitle = metas.pageTitle
      if (data.$layout) {
        self.engine.render(data.$views, data.$layout, data, function (error, result) {
          if (error) return next(error)
          next(null, result)
        })
      } else {
        next(new Error('render impossible sans $layout'))
      }
    })
    .seq(function (output) {
      next(null, output)
    })
    .catch(next)
}

module.exports = HtmlTransport
