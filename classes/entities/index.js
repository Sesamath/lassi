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


lassi.tools.mixin(Entities, lassi.Emitter);
/**
 * Construction du gestionnaire d'entités.
 * À ne jamais utiliser directement.  Cette classe est instanciée par
 * l'application elle-même.
 * @constructor
 * @namespace
 * @param {Object} settings
 */
function Entities(settings) {
  // Initialisation du mixin Emitter
  this.Emitter();

  this.entities = {}
  if (settings.database.client == 'sqlite3') {
    if (!lassi.fs.existsSync(settings.database.connection.filename)) {
      lassi.fs.openSync(settings.database.connection.filename, 'w');
    }
  }
  this.settings = settings;
  this.database = null;
}

/**
 * Enregistre une entité dans le modèle.
 * Cette méthode est appelée automatiquement par l'application lors de
 * l'exploration des composants.
 * @param {Entity} entity le module
 */
Entities.prototype.create = function(name) {
  return this.entities[name] = new EntityDefinition(name);
}

/**
 * Initialisation du stockage en base de données pour une entité.
 *
 * @param {Entity} entity L'entité
 * @param {SimpleCallback} next callback de retour
 * @private
 */
Entities.prototype.initializeEntityStorage = function(entity, next) {
  var _this = this

  function createStore(next) {
    var table = entity.table;
    _this.database.hasTable(table, function(error, exists) {
      if (error || exists) return next(error);
      var query = new lfw.lang.StringBuffer();
      switch(_this.database.client) {
        case 'mysql':
        case 'mysql2':
          // on laisse le IF NOT EXISTS au cas où hasTable se tromperait...
          // (ça génèrera des warnings sur la création des index plus loin mais n'empêchera pas le boot)
          query.push('CREATE TABLE IF NOT EXISTS %s (', table);
          query.push('  oid INT(11) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,');
          query.push('  data MEDIUMBLOB');
          query.push(') DEFAULT CHARACTER SET utf8');
          break;
        case 'pgsql':
          query.push('CREATE TABLE IF NOT EXISTS "%s" (', table);
          query.push('  oid SERIAL PRIMARY KEY NOT NULL,');
          query.push('  data BYTEA');
          query.push(');');
          break;
      }
      _this.database.execute(query, next);
    })
  }

  function createStoreIndex(next) {
    var table = entity.table+"_index";
    _this.database.hasTable(table, function(error, exists) {
      if (error || exists) return next(error);
      var queries = [];
      var query;
      switch(_this.database.client) {
        case 'mysql':
        case 'mysql2':
          query = new lfw.lang.StringBuffer();
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
          break;
        case 'pgsql':
          query = new lassi.lang.StringBuffer();
          query.push('CREATE TABLE IF NOT EXISTS "%s" (', table);
          query.push('  iid SERIAL PRIMARY KEY NOT NULL,');
          query.push('  name VARCHAR(255),');
          query.push('  _integer INTEGER,');
          query.push('  _string VARCHAR(255),');
          query.push('  _date TIMESTAMP,');
          query.push('  _boolean BOOLEAN,');
          query.push('  oid BIGINT');
          query.push(');');
          queries.push(query);
          queries.push('CREATE INDEX person_test_index_name_index     ON person_test_index (name);');
          queries.push('CREATE INDEX person_test_index__integer_index ON person_test_index (_integer);');
          queries.push('CREATE INDEX person_test_index__string_index  ON person_test_index (_string);');
          queries.push('CREATE INDEX person_test_index__date_index    ON person_test_index (_date);');
          queries.push('CREATE INDEX person_test_index__boolean_index ON person_test_index (_boolean);');
          queries.push('CREATE INDEX person_test_index_oid_index      ON person_test_index (oid);');
          break;
      }

      flow(queries)
        .seqEach(function(query) {
          _this.database.execute(query, this);
        })
        .empty()
        .seq(next)
        .catch(next)
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
  var _this = this
  flow()
    .seq(function() {
      var _next = this;
      lfw.database.Manager.instance().createClient(_this.settings.database, function(error, client) {
        if (error) return _next(error);
        _this.database = client;
        _next();
      });
    })
    .set(_.values(this.entities))
    .seqEach(function(entity) {
      var _next = this;
      _this.initializeEntityStorage(entity, function(error) {
        if (error) return _next(error);
        /**
         * Évènement généré lorsque le modèle est synchronisé.
         * @event Entities#storageInitialized
         */
        _this.emit('storageIntialized', entity.name);
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
  var _this = this

  function dropStoreIndex(next) {
    var table = entity.table+"_index";
    _this.database.schema.dropTableIfExists(table)
      .exec(function (error) {
          lassi.log.info('Suppression de la table %s for %s', table.red, entity.name.green);
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
  var _this = this

  flow(_.values(this.entities))
    .parEach(function(entity) { _this.dropEntityIndexes(entity, this) })
    .seq(function() { next() })
}

/**
 * Reconstruction des indexes d'une entité.
 * @param {Entity} entity L'entité dont on supprime l'indexe.
 * @param {SimpleCallback} next callback de retour
 * @private
 */
Entities.prototype.rebuildEntityIndexes = function(entity, next) {
  var _this = this

  function dropStoreIndex(next) {
    var table = entity.table+"_index";
    _this.database(table).delete()
    .exec(function (error) {
        lassi.log.info('Suppression des données de la table %s for %s', table.red, entity.name.green);
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
  var _this = this

  flow(_.values(this.entities))
    .parEach(function(entity) { _this.rebuildEntityIndexes(entity, this) })
    .seq(function() { next() })
}

module.exports = Entities;
