'use strict';
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
var _            = require('lodash');
var flow = require('seq');
var util = require('util');

/**
 * Construction d'une entité. Passez par la méthode {@link EntityDefinition#create} pour créer une entité.
 * @constructor
 * @param {Object} settings
 */
function Entity() { }

Entity.prototype.setDefinition = function(entity) {
  Object.defineProperty(this, 'definition', {value: entity});
}

/**
 * Répond true si l'instance de cette Entity n'a jamais été insérée en base de donnée
 * @return {boolean} true si l'instance n'a jamais été sauvegardée
 */
Entity.prototype.isNew = function() {
  return !this.oid;
}

/**
 * Callback de rendu d'une vue.
 * @callback EntityInstance~StoreCallback
 * @param {Error} error Une erreur est survenue.
 * @param {Entity} entity L'entité un fois sauvegardée.
 */

/**
 * Stockage d'une instance d'entité.
 * @param {Object=} options Spécification des options de stockage. Les options par défaut sont :
 *  - `options.object = true` : insertion ou mise à jour de l'objet ,
 *  - `options.index = true` : mise à jour des indexes.
 *
 * Attention: Ce paramètre est **surtout utilisé** à des fins d'optimisations (notamment
 * dans la commande de reindexation). Dans 99% des cas ce paramètre peut (et
 * doit) être omis.
 */
Entity.prototype.store = function(options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = undefined;
  }
  // on peut demander la mise à jour des index seulement (si un index calculé a changé sans modif de l'objet)
  // ou de l'objet seulement (modif d'une propriété non indexée)
  options = options || {object: true, index: true}
  callback = callback || function() {};
  var instance = this;
  var entity = this.definition;
  var database = entity.entities.database;
  var transaction;
  var indexTable = entity.table+"_index";
  // en cas de deadlock on recommence
  var attempts = 0;

  function updateObject(next) {
    var data = JSON.stringify(instance, function(k,v) {
      if (_.isFunction(v)) return;
      if (k[0]=='_') return;
      return v;
    });

    var query = '';
    if (instance.oid) {
      query = 
        'UPDATE '+instance.definition.table+
        ' SET data=?'+
        ' WHERE oid='+instance.oid;
      transaction.query(query, [new Buffer(data)], next);
    } else {
      query = 
        'INSERT INTO '+instance.definition.table+'(data)'+
        ' VALUES(?)';
      transaction.query(query, [new Buffer(data)], function (error, result) {
        if (error) return next(error);
        instance.oid = result.insertId;
        next();
      });
    }
  }

  function cleanIndexes(next) {
    if (!instance.oid) return next();
    if (instance.hasOwnProperty('_indexes')) instance._indexes = [];
    transaction.query('DELETE FROM '+indexTable+' WHERE oid='+instance.oid, next);
  }

  function buildIndexes(next) {
    if (!instance.hasOwnProperty('_indexes')) {
      var indexes = [];
      Object.defineProperty(instance, '_indexes', {value: indexes, writable: true});
    }
    for (var field in entity.indexes) {
      var index = entity.indexes[field];
      var values = index.callback.apply(instance);
      if ('undefined' === typeof instance[field]) {
        Object.defineProperty(instance, field, {value: values});
      }
      if (!util.isArray(values)) values = [ values ];
      for(var i in values) {
        var record = {
          name     : field,
          oid      : instance.oid,
          _string  : null,
          _date    : null,
          _integer : null,
          _boolean : null
        };
        record["_"+index.fieldType] = values[i];
        instance._indexes.push(record);
      }
    }
    next();
  }

  function storeIndexes(next) {
    if (instance._indexes.length===0) return next();

    var query = '';
    var parameters = [];
    var count = instance._indexes.length;
    var params = '';
    var first = true;
    for(var i = 0; i < count; i++) {
      if (i===0) query = 'INSERT INTO '+indexTable+'(';
      for (var key in instance._indexes[i]) {
        if (i===0) {
          if (!first) {
            query+=',';
            params+=',';
          } else {
            first = false;
          }
          query+= key;
          params+='?';
        }
        parameters.push(instance._indexes[i][key]);
      }
      if (i===0) {
        params = '  ('+params+')'
        query+= ') VALUES ';
      }
      query+= params+(i<(count-1)?', ':'');
    }
    transaction.query(query, parameters, next);
  }

  function save() {
    attempts++;
    flow()
      // le beforeStore avant de réclamer la connexion
      .seq(function() { entity._beforeStore.call(instance, this); } )
      .seq(function() { database.getConnection(this); })
      .seq(function(connection) {
        var _next = this;
          connection.query('START TRANSACTION', function(error) {
          if (error) return _next(error);
          transaction = connection;
          _next();
        })
      })
      // on traite d'abord les index, les plus susceptibles de déclencher des pb de deadlock
      .seq(function() {
        var end = this
        if (options.index) {
         flow().seq(function () {
           cleanIndexes(this);
         }).seq(function () {
           buildIndexes(this);
         }).seq(function () {
           storeIndexes(this);
         }).seq(function () {
           end();
         }).catch(function (error) {
           end(error);
         });
        } else {
         end();
        }
      })
      .seq(function()        { if (options.object) updateObject(this);  else this(); })
      .seq(function()        { transaction.query('COMMIT', this); })
      .seq(function()        { transaction.release(); entity._afterStore.call(instance, this); })
      .seq(function()        { callback(null, instance); })
      .catch(function(error) {
        // rollback && release
        function cancel(next) {
          if (transaction) {
           transaction.rollback(function () {
             transaction.release();
             next();
           });
          } else {
           next();
          }
        }
        // on peut avoir du deadlock en cas d'insert de deux ids consécutifs quasi simultanés
        // cf https://dev.mysql.com/doc/refman/5.5/en/innodb-next-key-locking.html
        if (attempts < 3) {
          lassi.log('lassi', "Erreur n°" +attempts +" dans entity.store, on retente pour voir si ça règle le deadlock probable");
          cancel(save);
        }
        // ça veut vraiment pas
        else cancel(function () {
          callback(error)
        })
      })
  } // save

  save();
}

/**
 * Efface cette instance d'entité en base (et ses index) puis appelle callback
 * sans argument (ou l'argument "Delete failed" si c'est le cas)
 * @param {SimpleCallback} callback La callback d'exécution
 */
Entity.prototype.delete = function(callback) {
  var instance = this;
  var entity = instance.definition;
  var indexTable = entity.table+"_index";
  var database = entity.entities.database;
  var transaction;
  flow()
    .seq(function() { database.getConnection(this); })
    .seq(function(connection) { 
      transaction = connection;
      connection.query('START TRANSACTION', this); 
    })
    .seq(function() {
      var _this = this;
      flow()
        .par(function() { transaction.query('DELETE FROM '+entity.table+' WHERE oid='+instance.oid, this); })
        .par(function() { transaction.query('DELETE FROM '+indexTable+' WHERE oid='+instance.oid, this); })
        .seq(function() { transaction.query('COMMIT', _this); })
        .catch(function(error) { 
          transaction.query('ROLLBACK', function() { 
            transaction.release();
            _this(error); 
          });
        });
    })
    .seq(function() {
      transaction.release();
      callback();
    })
    .catch(callback)
}

module.exports = Entity;
