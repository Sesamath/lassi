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

function DatabaseConnection(client) {
  this.client = client;
  this.handler = null;
}

DatabaseConnection.prototype.initialize = function(callback) {
  var self = this;
  function buildConnection() {
    self.handler = mysql.createConnection(self.client.settings);
    self.handler.on('error', function (error) {
      if (!error.fatal) return;
      if (error.code !== 'PROTOCOL_CONNECTION_LOST') throw error;
      console.error('> Re-connecting lost MySQL connection: ' + error.stack);
      buildConnection();
    });
  }
  buildConnection();
  callback();
}

DatabaseConnection.prototype.query = function(query, callback) {
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
}

DatabaseConnection.prototype.startTransaction = function(callback) {
  this.handler.beginTransaction(callback);
}

DatabaseConnection.prototype.commit = function(callback) {
  this.handler.commit(callback);
}

DatabaseConnection.prototype.rollback = function(callback) {
  this.handler.rollback(callback);
}

DatabaseConnection.prototype.debug = function(query) {
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
}

DatabaseConnection.prototype.release = function() {
  this.client.releaseConnection(this);
}

module.exports = DatabaseConnection;
