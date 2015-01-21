'use strict';
/*
 * @preserve This file is part of "node-lassi-example".
 *    Copyright 2009-2014, arNuméral
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
var _ = require('underscore')._;
/**
 * On défini ici la classe du component qui sera exportée plus
 * bas.
 * Les deux propriétés du contexte du constructeur sont
 *  - application pour un accès à l'instance de l'application (node_modules/lassi/lib/Application.js),
 *  - settings qui pointe sur la partie de la configuration
 *      dédiée au component (voir ./config)
 */
var component = lassi.Component();
component.blessed = function() {
  this.application.on('beforeRailUse', function(name, settings) {
    if (name=='logger') {
      lassi.require('morgan').token('post', function (req, res) {
        return (_.isEmpty(req.body)) ? '': JSON.stringify(req.body) + req.url;
      });
    }
  })
}

component.initialize = function(next) {
  this.application.transports.html.on('metas', function(metas) {
    metas.addCss('styles/main.css');
    metas.addJs('vendors/jquery.min.js');
  });

  this.application.transports.html.on('layout', function(useLayout) {
    /*
    if (useLayout.context.action = lassi.action.persons.list) {
      return useLayout(component, 'layout-403');
    }
    */

    if(useLayout.context.status) {
      switch(useLayout.context.status) {
        case 404: useLayout(component, 'layout-404'); break;
        case 403: useLayout(component, 'layout-403'); break;
      }
    } else {
      useLayout(component, 'layout-page');
    }
  });

  // Celui de initialize !!
  next();
}

module.exports = component;
