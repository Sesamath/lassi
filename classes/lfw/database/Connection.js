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

lassi.Class('lfw.database.Connection', {
  construct: function(client) {
    this.client = client;
  },

  debug: function(query) {
    var debug = query.text;
    var value;
    for(var i in query.parameters) {
      if (query.parameters[i]===null) value='NULL'
      else if (typeof query.parameters[i] === 'undefined') value = 'undefined'
      else if (typeof query.parameters[i] === 'string') value = "'"+query.parameters[i]+"'"
      else value = query.parameters[i].toString();
      debug = debug.replace('?', value);
    }
    console.log(debug);
  },
  release: function() {
    this.client.releaseConnection(this);
  }
})
