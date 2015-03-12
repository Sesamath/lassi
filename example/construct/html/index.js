"use strict";
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

lassi.component('example-html')

.config(function() {
  lassi.on('beforeTransport', function(data) {
    if (data.$status && data.$status > 400 && data.$status < 500) {
      data.$layout = 'layout-'+data.$status;
      data.$contentType = 'text/html';
      data.content = {$view: 'error', message: data.content};
    }
  });
})

.service('$appSettings', function() {
  return {
    title: function() { return 'Titre via appSettings'; }
  }
})

.controller(function($appSettings) {
  this.serve(__dirname+'/public');

  this.get('*', function(context) {
    if (context.request.url.indexOf('/api/')===0) return context.next();
    context.next({
      $layout: 'layout-page',
      $metas: {
        title: $appSettings.title(),
        css: ['styles/main.css'],
        js: ['vendors/jquery.min.js'],
      },
      sidebar: {
        $view: 'sidebar',
        actions: [
        '<a href="/">Accueil</a>',
        '<a href="/error404">404</a>',
        '<a href="/error403">403</a>',
        '<a href="/error500">500</a>',
        '<a href="/redirect">redirect</a>',
        '<a href="/api/toto">json</a>',
        '<a href="/api/person">entities</a>',
      ]}});
  });

  this.get(function(context) {
    context.next(null, {
      $contentType: 'text/html',
      $layout: 'layout-page',
      $views: __dirname+'/views',
      content: {
        $view: 'home',
        message: 'Bienvenue !!'}
    });
  });

  this.get('redirect', function(context) {
    context.redirect('/');
  });

  this.get('error404', function(context) {
    context.notFound("Je n'existe pas, non non...");
  });

  this.get('error403', function(context) {
    context.accessDenied("Qui va là ?");
  });

  this.get('error500', function(context) {
    context.next(new Error('Ça va pas bien dans ma tête...'));
  });
});

