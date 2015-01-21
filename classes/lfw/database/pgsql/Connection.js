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

var pg = require('pg').native;

lassi.Class('lfw.database.pgsql.Connection', {
  extend: lfw.database.Connection,

  construct: function(client) {
    this.parent(client);
    this.handler = null;
  },

  initialize: function(callback) {
    this.handler = new pg.Client(this.client.settings.connectionString);
    this.handler.connect(callback);
  },
  query: function(query, callback) {
    if (!query.hasOwnProperty('text')) {
      query = {text: query}
    }
    query.parameters = query.parameters || [];
    query.return = query.return || undefined;
    query.text = query.text.toString();
    //this.debug(query);

    for (var index=1; index <= query.parameters.length; index++) {
      query.text  = query.text .replace('?', '$'+index);
    }

    if (query.return) query.text += " RETURNING "+query.return;

    function handleResult(error, result) {
      if (error && error.code=='42P01') error.code = 'ER_NO_SUCH_TABLE';
      if (error) return callback(error);
      result = result.rows;
      callback(error, result);
    }
    if (query.parameters.length) {
      this.handler.query(query.text , query.parameters, handleResult);
    } else {
      this.handler.query(query.text, handleResult);
    }
  },
  startTransaction: function(callback) {
    this.handler.query('BEGIN', callback);
  },
  commit: function(callback) {
    this.handler.query('COMMIT', callback);
  },
  rollback: function(callback) {
    this.handler.query('ROLLBACK', callback);
  }
})

