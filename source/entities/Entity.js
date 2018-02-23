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

'use strict'

const _ = require('lodash')
const flow = require('an-flow')
const ObjectID = require('mongodb').ObjectID
// const log = require('an-log')('Entity');
const {castToType} = require('./internals')

/**
 * Construction d'une entité. Passez par la méthode {@link Component#entity} pour créer une entité.
 * @constructor
 * @param {Object} settings
 */
class Entity {
  // eslint-disable-next-line no-useless-constructor
  constructor () {
    // Warning: ne rien implémenter ici, car ce constructeur n'est pas
    // appelé dans EntityDefinition#create
    throw new Error(`Une entité n'est jamais instanciée directement. Utiliser EntityDefinition#create`)
  }
  setDefinition (entity) {
    Object.defineProperty(this, 'definition', {value: entity})
  }

  /**
   * Répond true si l'instance de cette Entity n'a jamais été insérée en base de donnée
   * @return {boolean} true si l'instance n'a jamais été sauvegardée
   */
  isNew () {
    return !this.oid
  }
  /**
   * Répond true si l'instance de cette Entity est "soft deleted"
   * @return {boolean}
   */
  isDeleted () {
    return !!this.__deletedAt
  }

  /**
   * Lance une validation de l'entity. Par défaut on parcourt toutes les validations :
   * validate(), validateJsonSchema() et validateOnChange()
   * @param {} cb
   * @param {*} param1
   */
  isValid (cb, {
    schema = true,
    onlyChangedAttributes = false
  } = {}) {
    let validators = [].concat(

      // Json-sSchema validation
      schema ? [function (cb) { this.definition._validateEntityWithSchema(this, cb) }] : [],

      // validateOnChange() validation
      _.uniq(_.flatten(_.values(onlyChangedAttributes
        ? _.pick(this.definition._toValidateOnChange, this.changedAttributes())
        : this.definition._toValidateOnChange
      ))),

      // validate() validation
      this.definition._toValidate
    )

    const self = this
    flow(validators)
      .seqEach(function (fn) {
        fn.call(self, this)
      })
      .done(cb)
  }

  values () {
    // on vire les _, $ et méthodes, puis serialize et sauvegarde
    // mais on les conserve sur l'entité elle-même car ça peut être utiles pour le afterStore
    //
    // On utilise _pick() pour passer outre une éventuelle méthode toJSON() qui viendrait modifier le contenu "jsonifié"
    // de l'entity (par exemple pour masquer le champ 'password' sur un utilisateur)
    return _.pick(this, function (v, k) {
      if (_.isFunction(v)) return false
      if (k[0] === '_') return false
      if (k[0] === '$') return false
      return true
    })
  }
  /**
   * Construits les index d'après l'entity
   * @returns {Object} avec une propriété par index (elle existe toujours mais sa valeur peut être undefined, ce qui se traduira par null dans le document mongo)
   */
  buildIndexes () {
    const entityDefinition = this.definition
    const indexes = {}
    let field, index, values
    for (field in entityDefinition.indexes) {
      index = entityDefinition.indexes[field]
      // valeurs retournées par la fct d'indexation
      values = index.callback.apply(this)
      // affectation après cast dans le type indiqué
      if (Array.isArray(values)) {
        indexes[field] = values.map(x => castToType(x, index.fieldType))
      } else {
        indexes[field] = castToType(values, index.fieldType)
      }
    }
    return indexes
  }

  getAttributeValue (att) {
    if (att === 'isDeleted') return this.isDeleted()
    return this[att]
  }

  onLoad () {
    if (this.definition._onLoad) this.definition._onLoad.call(this)
    // Keep track of the entity state when loaded, so that we can compare when storing
    this.$loadState = {}

    _.keys(this.definition._trackedAttributes).forEach((attribute) => {
      this.$loadState[attribute] = this.getAttributeValue(attribute)
    })
  }

  changedAttributes () {
    return _.filter(_.keys(this.definition._trackedAttributes), (att) => this.attributeHasChanged(att))
  }

  attributeHasChanged (attribute) {
    // Une nouvelle entité non sauvegardée n'a pas de "loadState", mais
    // on considère que tous ses attributs ont changés
    if (!this.$loadState) return true
    return this.attributeWas(attribute) !== this.getAttributeValue(attribute)
  }

  attributeWas (attribute) {
    if (!this.definition._trackedAttributes[attribute]) {
      throw new Error(`L'attribut ${attribute} n'est pas suivi`)
    }
    // Une nouvelle entité non sauvegardée n'a pas de "loadState"
    if (!this.$loadState) return null

    return this.$loadState[attribute]
  }

  beforeStore (cb, storeOptions) {
    const self = this
    flow()
      .seq(function () {
        if (self.definition._beforeStore) {
          self.definition._beforeStore.call(self, this)
        } else {
          this()
        }
      })
      .seq(function () {
        if (self.definition._skipValidation || storeOptions.skipValidation) return this()
        return self.isValid(this, {
          onlyChangedAttributes: true
        })
      })
      .done(cb)
  }

  db () {
    return this.definition.entities.db
  }

  /**
   * Stockage d'une instance d'entité.
   * @param {Object=} options non utilisé
   */
  store (options, callback) {
    const self = this
    const entity = this.definition

    if (_.isFunction(options)) {
      callback = options
      options = undefined
    }

    options = Object.assign({}, options, {object: true, index: true})

    callback = callback || function () {}

    let document
    flow().seq(function () {
      self.beforeStore(this, options)
    }).seq(function () {
      let isNew = !self.oid
      // on génère un oid sur les créations
      if (isNew) self.oid = ObjectID().toString()
      // les index
      document = self.buildIndexes()
      if (self.__deletedAt) {
        document.__deletedAt = self.__deletedAt
      }
      document._id = self.oid
      document._data = JSON.stringify(self.values())
      // {w:1} est le write concern par défaut, mais on le rend explicite (on veut que la callback
      // soit rappelée une fois que l'écriture est effective sur le 1er master)
      // @see https://docs.mongodb.com/manual/reference/write-concern/
      if (isNew) entity.getCollection().insertOne(document, {w: 1}, this)
      else entity.getCollection().replaceOne({_id: document._id}, document, {upsert: true, w: 1}, this)
    }).seq(function () {
      if (entity._afterStore) {
        // faudrait appeler _afterStore avec l'entité telle qu'elle serait récupérée de la base,
        // mais on l'a pas sous la main, et self devrait être en tout point identique,
        // au __deletedAt près qui est un index pas toujours présent ajouté par
        // EntityQuery.createEntitiesFromRows au retour de mongo
        entity._afterStore.call(self, this)
      } else {
        this()
      }
    }).seq(function () {
      // On appelle le onLoad() car l'état de l'entité en BDD a changé,
      // comme si l'entity avait été "rechargée".
      self.onLoad()
      callback(null, self)
    }).catch(callback)
  }

  reindex (callback) {
    // faut pouvoir réindexer d'éventuel doublons pour mieux les trouver ensuite
    this.$byPassDuplicate = true
    this.store(callback)
  }

  /**
   * Restaure un élément supprimé en soft-delete
   * @param {SimpleCallback} callback
   */
  restore (callback) {
    var self = this
    var entity = this.definition

    flow()
      .seq(function () {
        if (!self.oid) return this('Impossible de restaurer une entité sans oid')
        entity.getCollection().update({
          _id: self.oid
        }, {
          $unset: {__deletedAt: ''}
        }, this)
      })
      .seq(function () {
        // On appelle le onLoad() car l'état de l'entité en BDD a changé,
        // comme si l'entity avait été "rechargée".
        self.onLoad()
        callback(null, self)
      })
      .catch(callback)
  }

  /**
   * Imposera la restauration au prochain store si c'était un objet softDeleted
   * (ne fait rien sinon)
   * @return {Entity}
   */
  markToRestore () {
    this.__deletedAt = null
    return this
  }

  /**
   * Effectue une suppression "douce" de l'entité
   * @param {SimpleCallback} callback
   * @see restore
   */
  softDelete (callback) {
    if (!this.oid) return callback(new Error(`Impossible de softDelete une entité qui n'a pas encore été sauvegardée`))
    this.__deletedAt = new Date()
    this.store(callback)
  }

  /**
   * Efface cette instance d'entité en base (et ses index) puis appelle callback
   * avec une éventuelle erreur
   * @param {SimpleCallback} callback
   */
  delete (callback) {
    var self = this
    // @todo activer ce throw ?
    // if (!self.oid) throw new Error('Impossible d’effacer une entity sans oid')
    var entity = this.definition
    flow()
      .seq(function () {
        if (entity._beforeDelete) {
          entity._beforeDelete.call(self, this)
        } else {
          this()
        }
      })
      .seq(function () {
        if (!self.oid) return this()
        entity.getCollection().remove({_id: self.oid}, {w: 1}, this)
      })
      .done(callback)
  }
}

module.exports = Entity
