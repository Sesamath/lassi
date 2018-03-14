'use strict'
/*
 * This file is part of "node-lassi-example".
 *    Copyright 2009-2012, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "node-lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "node-lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "node-lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
const path = require('path')
lassi.component('example-html')

  .config(function ($appSettings) {
    lassi.on('beforeTransport', function (context, data) {
      if (context.status >= 400 && context.status < 500) {
        context.contentType = 'text/html'
        data.$layout = 'layout-' + context.status
        data.content = {
          $view: 'error',
          message: (context.status === 404 ? 'not found' : 'access denied') + ' ' + context.request.url
        }
      }
      if (context.contentType === 'text/html') {
        data.$metas = data.$metas || {}
        data.$views = path.join(__dirname, '/views')
        Object.assign(data.$metas, {
          title: $appSettings.title(),
          css: ['/styles/main.css'],
          js: ['/vendors/jquery.min.js']
        })
        data.$layout = data.$layout || 'layout-page'
      }
    })
  })

  .service('$appSettings', function () {
    return {
      title: function () { return 'Titre via appSettings' }
    }
  })

  .controller(function ($appSettings) {
    this.serve(path.join(__dirname, '/public'))

    function sidebar (data) {
      data.sidebar = {
        $view: 'sidebar',
        actions: [
          '<a href="/">Accueil</a>',
          '<a href="/images/test.jpg">Fichier statique</a>',
          '<a href="/vraie404">404 réelle</a>',
          '<a href="/error404">404 programmée</a>',
          '<a href="/error403">403 programmée</a>',
          '<a href="/error500">500</a>',
          '<a href="/timeout">timeout KO</a>',
          '<a href="/timeout1">timeout OK</a>',
          '<a href="/too-late">too late..</a>',
          '<a href="/redirect">redirect</a>',
          '<a href="/api/toto">json</a>',
          '<a href="/api/person">entities</a>'
        ]}
      return data
    }

    this.get(function (context) {
      var data = {
        $metas: {
          title: $appSettings.title(),
          css: [ 'aaa' ]
        },
        content: {
          $view: 'home',
          message: 'Bienvenue !!'
        }
      }
      sidebar(data)
      context.html(data)
    })

    this.get('redirect', function (context) {
      context.redirect('/')
    })

    this.get('timeout', function (context) {
      setTimeout(function () {
        context.plain('coucou')
      }, 2000)
    })

    this.get('timeout1', function (context) {
      context.timeout = 3000
      setTimeout(function () {
        context.plain('coucou')
      }, 2000)
    })

    this.get('too-late', function (context) {
      setTimeout(function () {
        context.plain('in time...')
      }, 500)
      setTimeout(function () {
        context.plain('too late...')
      }, 800)
    })

    this.get('error404', function (context) {
      context.notFound("Je n'existe pas, non non...")
    })

    this.get('error403', function (context) {
      context.accessDenied('Qui va là ?')
    })

    this.get('error500', function (context) {
      context.next(new Error('Ça va pas bien dans ma tête...'))
    })
  })
