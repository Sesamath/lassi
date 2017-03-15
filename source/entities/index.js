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
var Server           = require('mongodb').Server;
var Db               = require('mongodb').Db;
var log              = require('an-log')('Entities');

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

  /**
   * Initialisation du stockage en base de données pour une entité.
   *
   * @param {Entity} entity L'entité
   * @param {SimpleCallback} cb callback de retour
   * @private
   */
  initializeEntity(entity, cb) {
    var self = this;
    flow()
    .seq(function() {
      self.connection.collection('counters').findOne({_id: entity.name}, this)
    })
    .seq(function(seq) {
      if (!seq) {
        self.connection.collection('counters').save({_id: entity.name, seq: 0}, this)
      } else {
        this();
      }
    })
    .done(cb);
  }

  /**
   * Initialisation de l'espace de stockage
   * @param {SimpleCallback} cb
   */
  initialize(cb) {
    var settings = this.settings.database;
    var self = this;
    flow()
    .seq(function() {
      var server = new Server(settings.host, settings.port, {
        'auto_reconnect': settings.autoReconnect || true,
        poolSize        : settings.poolSize || 4
      });
      self.connection = new Db(settings.name, server , { w:0, 'native_parser': false });
      self.connection.open(this);
    })
    .seq(function(connection) {
      if (!settings.user) return this();
      self.connection.authenticate(settings.user, settings.password, this);
    })
    .done(cb);
  }


  /**
   * @deprecated
   */
  dropIndexes(next) {
    log('dropIndexes déprécié');
    next();
  }

  /**
   * Reconstruction des indexes d'une entité.
   * @param {Entity} entity L'entité dont on supprime l'indexe.
   * @param {SimpleCallback} next callback de retour
   * @private
   */
  rebuildEntityIndexes(entity, next) {
    flow()
    .seq(function() {
      entity.match().grab(this);
    })
    .seqEach(function(object) {
      object.store(this);
    })
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
      .seqEach(function(entity) { self.rebuildEntityIndexes(entity, this) })
      .seq(function() { next() })
  }

}

module.exports = Entities;
