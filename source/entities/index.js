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

'use strict'

const _ = require('lodash')
const flow = require('an-flow')
const EventEmitter = require('events').EventEmitter
const MongoClient = require('mongodb').MongoClient
const { hasProp } = require('sesajstools')

// const log              = require('an-log')('$entities');
const EntityDefinition = require('./EntityDefinition')

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
    super()
    this.client = null
    this.db = null
    this.entities = {}
    this.settings = settings
  }

  /**
   * Ferme la connexion ouverte dans initialize
   * (reset this.db mais pas this.entities)
   */
  close (next) {
    if (this.client) {
      this.client.close(false, (error) => {
        if (error) console.error(error)
        if (next) next(error)
      })
      // on met ça à null tout de suite, pas très grave si qqun relançait un client alors que close n'avait pas terminé
      this.client = null
      this.db = null
    }
  }

  /**
   * Enregistre une entité dans le modèle.
   * Cette méthode est appelée automatiquement par l'application lors de
   * l'exploration des composants.
   * @param {Entity} entity le module
   */
  define (name) {
    const def = new EntityDefinition(name)
    def._bless(this)
    this.entities[name] = def
    return def
  }

  /**
   * Retourne la liste des EntityDefinitions existantes
   * @return {object}
   */
  definitions () {
    return this.entities
  }

  /**
   * Initialisation de l'espace de stockage puis appel de chaque _initialize des entity déjà définies
   * @param {simpleCallback} cb
   */
  initialize (cb) {
    const self = this
    if (self.client) return cb(Error('entities.initialize a déjà été appelé'))
    flow().seq(function () {
      const settings = self.settings.database
      const {name, host, port, user, password, authSource} = settings
      const authMechanism = settings.authMechanism || 'DEFAULT'
      // cf http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect pour les options possibles
      const options = settings.options || {}
      options.useNewUrlParser = true
      // pour compatibilité ascendante, poolSize était mis directement dans les settings
      if (settings.poolSize && !options.poolSize) {
        console.error(`poolsize doit désormais être indiqué dans database.options.poolsize (defaut : ${defaultPoolSize})`)
        options.poolSize = settings.poolSize
      }
      if (!options.poolSize) options.poolSize = defaultPoolSize
      // on pourra virer ça dans les prochaines versions de mongodb, avec le driver 3.0 & 3.1
      // si on le met pas ça affiche un avertissement
      options.useNewUrlParser = true
      // construction de l'url de connexion, cf docs.mongodb.org/manual/reference/connection-string/
      let url = 'mongodb://'
      if (user && password) url += `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
      url += `${host}:${port}/${name}?authMechanism=${authMechanism}`
      if (authSource) url += `&authSource=${authSource}`
      // à partir de la version 3.1 il faut passer ça pour éviter un warning
      if (!hasProp(options, 'useNewUrlParser')) options.useNewUrlParser = true
      if (!hasProp(options, 'useUnifiedTopology')) options.useUnifiedTopology = true
      MongoClient.connect(url, options, this)
    }).seq(function (mongoClient) {
      self.client = mongoClient
      self.db = mongoClient.db()
      // on passe à l'init de toutes les entities
      this(null, Object.values(self.entities))
    }).seqEach(function (entityDefinition) {
      entityDefinition._initialize(this)
    }).empty().done(cb)
  }

  /**
   * Reconstruction des indexes d'une entité.
   * @param {Entity} entity L'entité dont on supprime l'indexe.
   * @param {simpleCallback} next callback de retour
   * @private
   */
  rebuildEntityIndexes (entity, next) {
    flow().seq(function () {
      entity.match().grab(this)
    }).seqEach(function (object) {
      object.store(this)
    }).done(next)
  }

  /**
   * Reconstruction des indexes.
   * Cette méthode est appelée par les commandes `lassi entities-XXX`
   * @param {simpleCallback} next callback de retour.
   */
  rebuildIndexes (next) {
    const self = this
    flow(_.values(this.entities)).seqEach(function (entity) {
      self.rebuildEntityIndexes(entity, this)
    }).done(next)
  }
}

module.exports = Entities
