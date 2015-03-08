'use strict';
/*
 * @preserve This file is part of "lassi-example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

// Récupération du module lassi
require('../../index.js')(__dirname+'/..');

require('./html');
require('./json');
require('./entities');

lassi.component('exemple', ['example-html', 'example-entities', 'example-json'])

.config(function($cache) {
  $cache.addEngine('', 'memcache', '127.0.0.1:11211');
  lassi.transports.html.on('metas', function(metas) {
    metas.addCss('styles/main.css');
    metas.addJs('vendors/jquery.min.js');
  });
  lassi.controllers.on('beforeTransport', function(data) {
    if (data.$status && data.$status > 400 && data.$status < 500) {
      data.$layout = 'layout-'+data.$status;
      data.$contentType = 'text/html';
      data.content = {$view: 'error', message: data.content};
    }
  });
})

.bootstrap();

