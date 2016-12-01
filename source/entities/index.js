/**
 * This file is part of "Lassi".
 *    Copyright 2009-2012, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "Lassi" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "Lassi" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "Lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
"use strict";

var _                = require('lodash');
var flow             = require('an-flow');
var EntityDefinition = require('./EntityDefinition');
var EventEmitter     = require('events').EventEmitter
var mysql            = require('mysql2');

class Entities extends EventEmitter {
  /**
   * Construction du gestionnaire d'entités.
   * À ne jamais utiliser directement.  Cette classe est instanciée par
   * l'application elle-même.
   * @constructor
   * @namespace
   * @param {Object} settings
   */
  constructor(settings) {
    super();
    this.entities = {}
    this.settings = settings;
    /** le pool de connexion */
    this.database = mysql.createPool(this.settings.database);
    var pool = this.database
    /**
     * Tente d'obtenir une connexion du pool et recommence plus tard sinon
     * (max 6 fois et 2.5s)
     * C'est complémentaire avec le queueLimit du pool, si la file d'attente est pleine
     * on attend un peu pour avoir une place dans la queue
     * @param next
     */
    pool.waitConnection = function waitConnection (next) {
      function nextTry () {
        tries++
        pool.getConnection(function (error, cnx) {
          if (error) {
            if (tries < 7) setTimeout(nextTry, 500)
            else next(new Error('DB connection impossible after 6 tries (each 500ms)'))
          } else {
            next(null, cnx)
          }
        })
      }
      var tries = 0
      nextTry()
    }
  }

  /**
   * Enregistre une entité dans le modèle.
   * Cette méthode est appelée automatiquement par l'application lors de
   * l'exploration des composants.
   * @param {Entity} entity le module
   */
  define(name) {
    var def = new EntityDefinition(name);
    def.bless(this);
    return this.entities[name] = def;
  }

  definitions() {
    return this.entities;
  }

  databaseHasTable(table, callback) {
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
  initializeEntity(entity, next) {
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
        .done(next)
      })
    }

    flow()
    .seq(function() { createStore(this); })
    .seq(function() { createStoreIndex(this); })
    .done(next);
  }

  /**
   * Ne fait rien
   * @deprecated
   * @param {SimpleCallback} next
   */
  initialize(next) {
    console.error(new Error('DEPRECATED : Entities.initialize does nothing anymore'))
    next();
  }

  /**
   * Suppression des indexes d'une entité.
   * @param {Entity} entity L'entité dont on supprime l'indexe.
   * @param {SimpleCallback} next callback de retour
   * @private
   */
  dropEntityIndexes(entity, next) {
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
    .done(next);
  }

  /**
   * Suppression des indexes.
   *
   * Cette méthode est appelée par les commandes `lassi entities-XXX`
   *
   * @param {SimpleCallback} next callback de retour.
   */
  dropIndexes(next) {
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
  rebuildEntityIndexes(entity, next) {
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
    .seqEach(function(object) { storeObject(object, this); })
    .done(next)
  }

  /**
   * Reconstruction des indexes.
   *
   * Cette méthode est appelée par les commandes `lassi entities-XXX`
   *
   * @param {SimpleCallback} next callback de retour.
   */
  rebuildIndexes(next) {
    var self = this

    flow(_.values(this.entities))
      .parEach(function(entity) { self.rebuildEntityIndexes(entity, this) })
      .seq(function() { next() })
  }

}

module.exports = Entities;
