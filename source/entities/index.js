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

'use strict';

const _                = require('lodash');
const flow             = require('an-flow');
const EntityDefinition = require('./EntityDefinition');
const EventEmitter     = require('events').EventEmitter
const MongoClient = require('mongodb').MongoClient
const log              = require('an-log')('Entities');

const defaultPoolSize = 10

class Entities extends EventEmitter {
  /**
   * Construction du gestionnaire d'entités.
   * À ne jamais utiliser directement.  Cette classe est instanciée par
   * l'application elle-même.
   * @constructor
   * @namespace
   * @param {Object} settings
   */
  constructor (settings) {
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
  define (name) {
    const def = new EntityDefinition(name);
    def.bless(this);
    return this.entities[name] = def;
  }

  definitions () {
    return this.entities;
  }

  /**
   * Initialisation du stockage en base de données pour une entité.
   *
   * @param {EntityDefinition} entity L'entité
   * @param {SimpleCallback} cb callback de retour
   * @private
   */
  initializeEntity (entity, cb) {
    entity.initialize(cb);
  }

  /**
   * Initialisation de l'espace de stockage
   * @param {SimpleCallback} cb
   */
  initialize (cb) {
    const settings = this.settings.database;
    const self = this;
    const {name, host, port, user, password, authSource} = settings
    const authMechanism = settings.authMechanism || 'DEFAULT'
    // cf http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect pour les options possibles
    const options = settings.options || {}
    // pour compatibilité ascendante, poolSize était mis directement dans les settings
    if (settings.poolSize) options.poolSize = settings.poolSize
    if (!options.poolSize) options.poolSize = defaultPoolSize
    // construction de l'url de connexion, cf docs.mongodb.org/manual/reference/connection-string/
    let url = 'mongodb://'
    if (user && password) url += `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
    url += `${host}:${port}/${name}?authMechanism=${authMechanism}`
    if (authSource) url += `&authSource=${authSource}`
    // on peut connecter
    MongoClient.connect(url, options, function (error, db) {
      if (error) return cb(error)
      self.db = db
      cb()
    })
  }

  /**
   * Vire les index
   * @deprecated
   */
  dropIndexes (next) {
    log.error('dropIndexes is deprecated');
    next();
  }

  /**
   * Reconstruction des indexes d'une entité.
   * @param {Entity} entity L'entité dont on supprime l'indexe.
   * @param {SimpleCallback} next callback de retour
   * @private
   */
  rebuildEntityIndexes (entity, next) {
    flow().seq(function () {
      entity.match().grab(this);
    }).seqEach(function (object) {
      object.store(this);
    }).done(next)
  }

  /**
   * Reconstruction des indexes.
   * Cette méthode est appelée par les commandes `lassi entities-XXX`
   * @param {SimpleCallback} next callback de retour.
   */
  rebuildIndexes (next) {
    const self = this
    flow(_.values(this.entities)).seqEach(function (entity) {
      self.rebuildEntityIndexes(entity, this)
    }).done(next)
  }
}

module.exports = Entities;
