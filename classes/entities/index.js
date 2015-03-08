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

var _                = require('underscore')._;
var flow             = require('seq');
var EntityDefinition = require('./EntityDefinition');
var EventEmitter = require('events').EventEmitter
var util         = require('util');
var DatabaseManager = require('../database');
var DatabaseQuery = require('../database/DatabaseQuery');


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
  if (settings.database.client == 'sqlite3') {
    if (!lassi.fs.existsSync(settings.database.connection.filename)) {
      lassi.fs.openSync(settings.database.connection.filename, 'w');
    }
  }
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

/**
 * Initialisation du stockage en base de données pour une entité.
 *
 * @param {Entity} entity L'entité
 * @param {SimpleCallback} next callback de retour
 * @private
 */
Entities.prototype.initializeEntityStorage = function(entity, next) {
  var self = this

  function createStore(next) {
    var table = entity.table;
    self.database.hasTable(table, function(error, exists) {
      console.log(table, exists);
      if (error || exists) return next(error);
      var query = new DatabaseQuery();
      query.push('CREATE TABLE IF NOT EXISTS %s (', table);
      query.push('  oid INT(11) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
      query.push('  data MEDIUMBLOB');
      query.push(') DEFAULT CHARACTER SET utf8');
      self.database.execute(query, next);
    })
  }

  function createStoreIndex(next) {
    var table = entity.table+"_index";
    self.database.hasTable(table, function(error, exists) {
      if (error || exists) return next(error);
      var queries = [];
      var query = new DatabaseQuery();
      query.push('CREATE TABLE IF NOT EXISTS %s (', table);
      query.push('  iid INT(11) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
      query.push('  name VARCHAR(255),');
      query.push('  _integer INT(11),');
      query.push('  _string VARCHAR(255),');
      query.push('  _date DATETIME,');
      query.push('  _boolean TINYINT(1),');
      query.push('  oid BIGINT');
      query.push(') DEFAULT CHARACTER SET utf8;');
      queries.push(query);
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_name_index(name);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_nnteger_index(_integer);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_ntring_index(_string);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_nate_index(_date);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_noolean_index(_boolean);');
      queries.push('ALTER TABLE '+table+' ADD INDEX '+table+'_nid_index(oid);');

      flow(queries)
        .seqEach(function(query) { self.database.execute(query, this); })
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
Entities.prototype.initializeStorage = function(next) {
  var self = this
  flow()
    .seq(function() {
      var _next = this;
      DatabaseManager.instance().createClient(self.settings.database, function(error, client) {
        if (error) return _next(error);
        self.database = client;
        _next();
      });
    })
    .set(_.values(this.entities))
    .seqEach(function(entity) {
      var _next = this;
      self.initializeEntityStorage(entity, function(error) {
        if (error) return _next(error);
        /**
         * Évènement généré lorsque le modèle est synchronisé.
         * @event Entities#storageInitialized
         */
        self.emit('storageIntialized', entity.name);
        _next();
      });
    })
    .empty()
    .seq(next)
    .catch(next);
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
