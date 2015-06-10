"use strict";
/*
* This file is part of "Collection".
*    Copyright 2009-2012, arNuméral
*    Author : Yoran Brault
*    eMail  : yoran.brault@arnumeral.fr
*    Site   : http://arnumeral.fr
*
* "Collection" is free software; you can redistribute it and/or
* modify it under the terms of the GNU General Public License as
* published by the Free Software Foundation; either version 2.1 of
* the License, or (at your option) any later version.
*
* "Collection" is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* General Public License for more details.
*
* You should have received a copy of the GNU General Public
* License along with "Collection"; if not, write to the Free
* Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
* 02110-1301 USA, or see the FSF site: http://www.fsf.org.
*/

var _                = require('lodash');
var flow             = require('seq');
var EntityDefinition = require('./EntityDefinition');
var EventEmitter     = require('events').EventEmitter
var util             = require('util');
var mysql            = require('mysql2');


/**
 * Construction du gestionnaire d'entités.
 * À ne jamais utiliser directement.  Cette classe est instanciée par
 * l'application elle-même.
 * @constructor
 * @namespace
 * @param {Object} settings
 */
function Entities(settings) {
  this.entities = {}
  this.settings = settings;
  this.database = null;
}
util.inherits(Entities, EventEmitter)


/**
 * Enregistre une entité dans le modèle.
 * Cette méthode est appelée automatiquement par l'application lors de
 * l'exploration des composants.
 * @param {Entity} entity le module
 */
Entities.prototype.define = function(name) {
  var def = new EntityDefinition(name);
  def.bless(this);
  return this.entities[name] = def;
}

Entities.prototype.databaseHasTable = function(table, callback) {
  this.database.query('SELECT * FROM '+table+" LIMIT 1", function(error) {
    if (error && error.code == 'ER_NO_SUCH_TABLE') return callback(null, false);
    callback(error, true);
  })
}

/**
 * Initialisation du stockage en base de données pour une entité.
 *
 * @param {Entity} entity L'entité
 * @param {SimpleCallback} next callback de retour
 * @private
 */
Entities.prototype.initializeEntity = function(entity, next) {
  var self = this

  function createStore(next) {
    var table = entity.table;
    self.databaseHasTable(table, function(error, exists) {
      if (error || exists) return next(error);
      var query = [];
      query.push('CREATE TABLE IF NOT EXISTS '+table+' (');
      query.push('  oid INTEGER UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
      query.push('  data MEDIUMBLOB');
      query.push(') DEFAULT CHARACTER SET utf8');
      self.database.query(query.join(''), next);
    })
  }

  function createStoreIndex(next) {
    var table = entity.table+"_index";
    self.databaseHasTable(table, function(error, exists) {
      if (error || exists) return next(error);
      var queries = [];
      var query = [];
      query.push('CREATE TABLE IF NOT EXISTS '+table+' (');
      query.push('  iid INTEGER UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
      query.push('  name VARCHAR(255) DEFAULT NULL,');
      query.push('  _integer INTEGER DEFAULT NULL,');
      query.push('  _string VARCHAR(255) DEFAULT NULL,');
      query.push('  _date DATETIME DEFAULT NULL,');
      query.push('  _boolean TINYINT(1) DEFAULT NULL,');
      query.push('  oid INTEGER UNSIGNED NOT NULL ');
      query.push(') DEFAULT CHARACTER SET utf8;');
      queries.push(query.join(''));
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_name_index(name);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_integer_index(_integer);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_string_index(_string);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_date_index(_date);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_boolean_index(_boolean);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_oid_index(oid);');

      flow(queries)
        .seqEach(function(query) { self.database.query(query, this); })
        .empty().seq(next) .catch(next)
    })
  }

  flow()
    .seq(function() { createStore(this); })
    .seq(function() { createStoreIndex(this); })
    .empty()
    .seq(next)
    .catch(next);
}

/**
 * Initialisation des tables dans la base de donénes.
 *
 * Cette méthode est appelée par l'application au démarrage.
 * @param {SimpleCallback} next callback de retour.
 * @fires Entities#storageInitialized
 */
Entities.prototype.initialize = function(next) {
  this.database = mysql.createPool(this.settings.database);
  next();
}

/**
 * Suppression des indexes d'une entité.
 * @param {Entity} entity L'entité dont on supprime l'indexe.
 * @param {SimpleCallback} next callback de retour
 * @private
 */
Entities.prototype.dropEntityIndexes = function(entity, next) {
  var self = this

  function dropStoreIndex(next) {
    var table = entity.table+"_index";
    self.database.schema.dropTableIfExists(table)
      .exec(function (error) {
          console.log('Suppression de la table %s for %s', table.red, entity.name.green);
          next(error)
       });
  }

  flow()
    .seq(function() { dropStoreIndex(this); })
    .seq(function() { next() })
}

/**
 * Suppression des indexes.
 *
 * Cette méthode est appelée par les commandes `lassi entities-XXX`
 *
 * @param {SimpleCallback} next callback de retour.
 */
Entities.prototype.dropIndexes = function(next) {
  var self = this

  flow(_.values(this.entities))
    .parEach(function(entity) { self.dropEntityIndexes(entity, this) })
    .seq(function() { next() })
}

/**
 * Reconstruction des indexes d'une entité.
 * @param {Entity} entity L'entité dont on supprime l'indexe.
 * @param {SimpleCallback} next callback de retour
 * @private
 */
Entities.prototype.rebuildEntityIndexes = function(entity, next) {
  var self = this

  function dropStoreIndex(next) {
    var table = entity.table+"_index";
    self.database(table).delete()
    .exec(function (error) {
        console.log('Suppression des données de la table %s for %s', table.red, entity.name.green);
        next(error)
     });
  }

  function loadObjects(next) {
    entity.match().grab(function(error, objects) {
      if (error) return next(error);
      next(null, objects);
    });
  }

  function storeObject(object, next) {
    object.store({object: false, index: true}, next);
  }

  flow()
    .seq(function() { dropStoreIndex(this); })
    .seq(function() { loadObjects(this);  })
    .flatten()
    .seqEach(function(object) { storeObject(object, this); })
    .seq(function() { next() })
    .catch(next)
}

/**
 * Reconstruction des indexes.
 *
 * Cette méthode est appelée par les commandes `lassi entities-XXX`
 *
 * @param {SimpleCallback} next callback de retour.
 */
Entities.prototype.rebuildIndexes = function(next) {
  var self = this

  flow(_.values(this.entities))
    .parEach(function(entity) { self.rebuildEntityIndexes(entity, this) })
    .seq(function() { next() })
}

module.exports = Entities;
