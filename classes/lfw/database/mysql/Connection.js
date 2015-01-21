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

var mysql = require('mysql');

lassi.Class('lfw.database.mysql.Connection', {
  extend: lfw.database.Connection,

  construct: function(client) {
    this.parent(client);
    this.handler = null;
  },

  initialize: function(callback) {
    this.handler = mysql.createConnection(this.client.settings);
    callback();
  },
  query: function(query, callback) {
    if (!query.hasOwnProperty('text')) {
      query = {text: query}
    }
    query.parameters = query.parameters || [];
    query.return = query.return || undefined;
    query.text = query.text.toString();
    //this.debug(query);
    this.handler.query(query.text, query.parameters, function(error, result) {
      if (error) return callback(error);
      if (query.return) {
        var tmp = [{}];
        tmp[0][query.return] = result.insertId;
        result = tmp;
      }
      callback(null, result);
    });
  },
  startTransaction: function(callback) {
    this.handler.beginTransaction(callback);
  },
  commit: function(callback) {
    this.handler.commit(callback);
  },
  rollback: function(callback) {
    this.handler.rollback(callback);
  },
})

