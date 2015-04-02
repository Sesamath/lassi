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

var flow = require('seq');
var DatabaseConnection = require('./DatabaseConnection');

/**
 * @constructor
 */
function DatabaseClient(settings) {
  settings.multipleStatements = true;
  settings.pool = settings.pool || 10;
  settings.waiters = settings.waiters || 10000;
  settings.waitTimeout = settings.waitTimeout || 1000;
  this.settings = settings;
  this.pool = [];
  this.waiting = [];
}

DatabaseClient.prototype.initialize = function(callback) {
  var _this = this;
  for (var i=0; i < this.settings.pool; i++) {
    this.pool.push({ id: i, acquired: false, connection: _this.createConnection() });
  }

  flow(this.pool)
    .seqEach(function(item) {
      var _next = this;
      item.connection.initialize(function(error) {
        if (error) _next(error);
        _next();
      })
    })
    .empty()
    .seq(function() { callback(null, _this); })
    .catch(callback);
}

/**
 * Récupération d'un connection dans le pool
 * @param {callback} callback la callback de retour.
 */
DatabaseClient.prototype.getConnection = function(callback) {
  if (this.waiting.length > this.settings.waiters) return callback(new Error('Trops de personnes attendent...'));
  var timeout = (
    function(waiters, callback) {
      return function() {
        clearTimeout(callback.__timeout__);
        for(var i in waiters) {
          if (waiters[i].__timeout__==callback.timeout) {
            delete waiters[i];
            break;
          }
        }
        callback(new Error("Timeout sur l'attente d'une connexion"));
      }
    })(this.waiting, callback);
  callback.__timeout__ = setTimeout(timeout, this.settings.waitTimeout);
  this.waiting.push(callback);
  this.processWaiters();
}


DatabaseClient.prototype.processWaiters = function() {
  if (this.waiting.length===0) return;
  //console.log('pool:', this.pool.length, 'waiting:', this.waiting.length);
  for (var i in this.pool) {
    if (!this.pool[i].acquired) {
      this.pool[i].acquired = true;
      this.pool[i].connection.__id__ = i;
      var callback = this.waiting.shift();
      clearTimeout(callback.__timeout__);
      callback(null, this.pool[i].connection);
    }
    if (this.waiting.length===0) break;
  }
}

/**
 * Libération de la connection et retour au pool.
 */
DatabaseClient.prototype.releaseConnection = function(connection) {
  this.pool[connection.__id__].acquired = false;
  this.processWaiters();
}

/**
 * Helper pour lancer une requête simple.
 */
DatabaseClient.prototype.execute = function(query, callback) {
  this.getConnection(function(error, connection) {
    if (error) return callback(error);
    connection.query(query, function(error, result) {
      connection.release();
      callback(error, result);
    });
  });
}

DatabaseClient.prototype.startTransaction = function(callback) {
  var _this = this;
  this.getConnection(function(error, connection) {
    if (error) return callback(error);
    connection.startTransaction(function(error) {
      if (error) {
        if (error) _this.releaseConnection(connection)
        return callback(error);
      }
      callback(null, connection);
    });
  });
}


/**
 * Helper pour vérifier l'existance d'une table.
 */
DatabaseClient.prototype.hasTable = function(table, callback) {
  this.execute('SELECT * FROM '+table+" LIMIT 1", function(error) {
    if (error && error.code == 'ER_NO_SUCH_TABLE') return callback(null, false);
    callback(error, true);
  })
}

DatabaseClient.prototype.createConnection = function() {
  return new DatabaseConnection(this);
}

module.exports = DatabaseClient;
