'use strict';

var log = require('an-log')('$entities');
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
var _    = require('lodash');
var flow = require('an-flow');
var util = require('util');

// met à jour une entité en bdd
function updateObject (instance, transaction, next) {
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

// efface les index en bdd et dans instance._indexes
function cleanIndexes(instance, transaction, next) {
  var indexTable = instance.definition.table + "_index"
  if (!instance.oid) return next()
  if (instance.hasOwnProperty('_indexes')) instance._indexes = [];
  transaction.query('DELETE FROM ' + indexTable + ' WHERE oid=' + instance.oid, next);
}

// reconstruit instance._indexes (synchrone)
function buildIndexes(instance, next) {
  var entity = instance.definition
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

// enregistre instance._indexes en bdd
function storeIndexes(instance, transaction, next) {
  var indexTable = instance.definition.table + "_index"
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

/**
 * Démarre la transaction sur une connexion existante et fait toutes les opérations
 * Ne release pas la connexion
 * @param options
 * @param instance
 * @param connection
 * @param next
 */
function tryToSave (options, instance, connection, next) {
  flow().seq(function () {
    var nextStep = this
    // on gère la callback ici car on a pas encore de transaction
    connection.query('START TRANSACTION', function (error) {
      if (error) {
        // on a une connexion mais on peut pas démarrer de transaction, curieux
        console.error('plantage du transaction start')
        next(error)
      } else {
        nextStep()
      }
    })
  }).seq(function()  {
    // on traite d'abord les index, les plus susceptibles de déclencher des pb de deadlock
    if (options.index) cleanIndexes(instance, connection, this)
    else this()
  }).seq(function()  {
    if (options.object) updateObject(instance, connection, this)
    else this()
  }).seq(function () {
    if (options.index) buildIndexes(instance, this)
    else this()
  }).seq(function () {
    if (options.index) storeIndexes(instance, connection, this)
    else this()
  }).seq(function()  {
    connection.query('COMMIT', next)
  }).catch(function (error) {
    connection.query('ROLLBACK', function (rollbackError) {
      if (rollbackError) next(rollbackError)
      else next(error)
    })
  })
}

/**
 * Construction d'une entité. Passez par la méthode {@link Component#entity} pour créer une entité.
 * @constructor
 * @param {Object} settings
 */
class Entity {

  setDefinition(entity) {
    Object.defineProperty(this, 'definition', {value: entity});
  }

  /**
   * Répond true si l'instance de cette Entity n'a jamais été insérée en base de donnée
   * @return {boolean} true si l'instance n'a jamais été sauvegardée
   */
  isNew() {
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
  store(options, callback) {
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
    // en cas de deadlock on recommencera
    var attempts = 0;
    var connection

    // tente l'écriture en bdd et se rappelle une fois en cas de pb
    // release la connexion dans tous les cas
    function save (next) {
      attempts++
      if (attempts < 3) {
        tryToSave(options, instance, connection, function (error) {
          if (error) {
            console.error(error)
            save(next)
          } else {
            connection.release()
            next()
          }
        })
      } else {
        connection.release()
        next(new Error('abandon après 2 tentatives d’écriture en bdd'))
      }
    }

    flow().seq(function () {
      // step1 on essaie d'avoir une connexion sur le pool, sinon on attend un peu avant de recommencer
      entity.entities.database.getConnection(this)
    }).seq(function (cnx) {
      // step2 connexion ok, on lance les écritures, ça recommencera une fois (en cas de deadlock)
      connection = cnx
      save(this)
    }).seq(function () {
      entity._afterStore.call(instance, this)
    }).seq(function () {
      callback(null, instance)
    }).catch(callback)
  } // store

  reindex(callback) {
    this.store({object: false, index: true}, callback);
  }

  /**
   * Efface cette instance d'entité en base (et ses index) puis appelle callback
   * avec une éventuelle erreur
   * @param {SimpleCallback} callback
   */
  delete(callback) {
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
      .seq(function() { transaction.query('DELETE e, i FROM '+entity.table+' e LEFT JOIN '+indexTable+' i USING(oid) WHERE e.oid = ' +instance.oid, this); })
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

}


module.exports = Entity;
