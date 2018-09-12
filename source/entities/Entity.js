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
  setDefinition (entityDefinition) {
    Object.defineProperty(this, 'definition', {value: entityDefinition})
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
   * @param {errorCallback} cb rappelée avec la première erreur de validation (ou rien si c'est valide)
   * @param {object} [options]
   * @param {boolean} [options.schema=true] passer false pour ne pas tester le schéma éventuel
   * @param {boolean} [options.onlyChangedAttributes=false] passer true pour ne tester que les attributs modifiés
   */
  isValid (cb, {schema = true, onlyChangedAttributes = false} = {}) {
    let validators = [].concat(

      // Json-sSchema validation
      schema ? [function (cb) { this.definition._validateEntityWithSchema(this, cb) }] : [],

      // validateOnChange() validation.
      // this.definition._toValidateOnChange est de la forme: {
      //   attributeName: [validateFunction1, validateFunction2]
      // }
      // On prend donc toutes les fonctions correspondant aux attributs ayant changés
      // puis on applique uniq() car une fonction peut être déclarée sur plusieurs changements d'attributs.
      _.uniq(_.flatten(_.values(
        onlyChangedAttributes
          ? _.pick(this.definition._toValidateOnChange, this.changedAttributes())
          : this.definition._toValidateOnChange
      ))),

      // validate() validation
      this.definition._toValidate
    )

    const entity = this
    flow(validators).seqEach(function (fn) {
      fn.call(entity, this)
    }).done(cb)
  }

  /**
   * Retourne une shallow copy de l'entity en filtrant certaines de ses données :
   * - les attributs de 1er niveau ayant un nom commençant par "_"
   * - les attributs ayant un nom commençant par $ (récursion sur les plain object seulement, pas les Date RegExp & co)
   * - les attributs étant function
   * - les attributs ayant des valeurs null, undefined ou NaN (en profondeur)
   * @return {Object}
   */
  values () {
    const isPlainObject = (o) => o && typeof o === 'object' && Object.prototype.toString.call(o) === '[object Object]'

    const cleanArray = (a) => a.map(elt => {
      if (isPlainObject(elt)) return copyCleanProps(elt, {})
      if (Array.isArray(elt) && elt.length) return cleanArray(elt)
      return elt
    })

    const copyCleanProps = (obj, dest, isFirstLevel = false) => {
      Object.keys(obj).forEach(key => {
        const v = obj[key]
        // au 1er niveau on vire les propriétés préfixées par _
        if (isFirstLevel && (key[0] === '_')) return
        // à tous les niveaux on vire null, undefined, function et préfixe $
        if (v === null || v === undefined || typeof v === 'function' || key[0] === '$') return
        // on fait de la récursion sur les objets qui n'ont pas d'autre constructeur que Object
        // (ni Regexp ni Date, les objets définis avec un constructeur classique passent ce filtre)
        if (isPlainObject(v)) {
          dest[key] = {}
          copyCleanProps(v, dest[key])

        // et chaque élément de tableau (on vire pas null et undefined)
        } else if (Array.isArray(v) && v.length) {
          dest[key] = cleanArray(v)

        // pour les autres on prend la valeur telle quelle
        } else {
          dest[key] = v
        }
      })
      return dest
    }

    return copyCleanProps(this, {}, true)
  }

  /**
   * Construits les index d'après l'entity
   * @private
   * @returns {Object} avec une propriété par index (elle existe toujours mais sa valeur peut être undefined, ce qui se traduira par null dans le document mongo)
   */
  buildIndexes () {
    const def = this.definition
    const entity = this
    const indexes = {}

    // pas besoin de traiter les BUILT_IN_INDEXES, ils sont gérés directement dans le store
    _.forEach(def.indexes, ({callback, fieldType, useData, indexName}) => {
      if (useData) return // on utilise directement un index sur _data
      // la cb d'index peut planter, on veut récupérer le message pour le renvoyer avec plus d'infos
      try {
        // valeurs retournées par la fct d'indexation si y'en a une (inclus normalizer s'il existe)
        const value = callback ? callback.call(entity) : entity[indexName]

        if (value === undefined || value === null) {
          // https://docs.mongodb.com/manual/core/index-sparse/
          // En résumé
          // - non-sparse : tous les documents sont indexés :
          //   => si la propriété n'existe pas dans l'objet elle sera indexée quand même avec une valeur null
          //   => si la propriété vaut undefined elle sera indexée avec null
          // - sparse : seulement les documents ayant la propriété (même null|undefined) sont indexés (undefined indexé avec la valeur null)
          // Afin d'avoir un comportement homogène, buildIndexes va harmoniser les 3 cas
          // - prop absente
          // - prop avec valeur undefined
          // - prop avec valeur null
          // 1) si index non-sparse, on ne retourne rien et on laisse faire mongo,
          //    l'index ne sera pas dans le doc mongo mais ça revient au même qu'un null,
          //    dans les 3 cas isNull remontera l'entity.
          // 2) si index sparse, on supprime l'index pour null|undefined
          //    => dans les 3 cas le doc mongo n'est pas indexé
          //    => isNull ne remontera jamais rien, il throw pour s'assurer qu'on ne l'utilise jamais dans ce cas
          return
        }

        const castAndCheckNaN = (v) => {
          // le test précédent ne gère pas les array, et dans un array on garde la valeur originale
          // donc pour l'index ça se traduit par null (isNull remontera les entity dont la valeur contient null ou undefined)
          // c'est pas très logique (on pourrait s'attendre à ce que isNull remonte les entities dont la valeur est un tableau vide)
          // mais on veut le même comportement avec et sans useData (et avec mongo indexe l'objet [])
          if (v === undefined || v === null) return null
          if (fieldType) v = castToType(v, fieldType)
          if (typeof v === 'number' && Number.isNaN(v)) throw Error(`${indexName} contient NaN`)
          return v
        }

        // affectation après cast dans le type indiqué (si y'en a un)
        if (Array.isArray(value)) indexes[indexName] = value.map(castAndCheckNaN)
        else indexes[indexName] = castAndCheckNaN(value)
      } catch (error) {
        error.message = `Pb sur l’index ${indexName} de l’entity ${def.name} oid ${entity.oid}, ${error.message}`
        throw error
      }
    })

    return indexes
  }

  /**
   * Idem this[att] sauf si att vaut isDeleted (retourne alors le booléen)
   * @private
   * @param {string} att
   * @return {*}
   */
  getAttributeValue (att) {
    if (att === 'isDeleted') return this.isDeleted()
    return this[att]
  }

  /**
   * Appelé après un load bdd pour stocker les valeurs des attributs suivis
   * @private
   */
  onLoad () {
    if (this.definition._onLoad) this.definition._onLoad.call(this)
    // Keep track of the entity state when loaded, so that we can compare when storing
    this.$loadState = {}

    Object.keys(this.definition._trackedAttributes).forEach((attribute) => {
      this.$loadState[attribute] = this.getAttributeValue(attribute)
    })
  }

  /**
   * Retourne la liste des attributs suivis qui ont changés depuis la sortie de la bdd
   * @return {string[]}
   */
  changedAttributes () {
    return Object.keys(this.definition._trackedAttributes).filter((att) => this.attributeHasChanged(att))
  }

  /**
   * Retourne true si l'attribut suivi a changé
   * @throws si y'a pas eu de EntityDefinitiontrackAttribute(attribute) sur cette Entity
   * @param {string} attribute
   * @return {boolean} true si l'attribut a changé (toujours le cas sur une création)
   */
  attributeHasChanged (attribute) {
    // Une nouvelle entité non sauvegardée n'a pas de "loadState", mais
    // on considère que tous ses attributs ont changés
    if (!this.$loadState) return true
    return this.attributeWas(attribute) !== this.getAttributeValue(attribute)
  }

  /**
   * Retourne la valeur de l'attribut au dernier chargement depuis la base
   * @throws si y'a pas eu de EntityDefinitiontrackAttribute(attribute) sur cette Entity
   * @param {string} attribute
   * @return {*} null si l'entity ne sort pas de la db
   */
  attributeWas (attribute) {
    if (!this.definition._trackedAttributes[attribute]) {
      throw new Error(`L'attribut ${attribute} n'est pas suivi`)
    }
    // Une nouvelle entité non sauvegardée n'a pas de "loadState"
    if (!this.$loadState) return null

    return this.$loadState[attribute]
  }

  /**
   * Applique le beforeStore s'il y en a un puis vérifie la validité
   * @private
   * @param {Entity~entityCallback} cb
   * @param {Object} [storeOptions]
   * @param {boolean} [storeOptions.skipValidation=false]
   */
  beforeStore (cb, storeOptions) {
    const entity = this
    const def = this.definition
    flow().seq(function () {
      if (def._beforeStore) def._beforeStore.call(entity, this)
      else this()
    }).seq(function () {
      if (def._skipValidation || storeOptions.skipValidation) cb()
      else entity.isValid(cb, {onlyChangedAttributes: true})
    }).catch(cb)
  }

  /**
   * Retourne l'objet db de mongo. À réserver à des cas très particuliers,
   * à priori il faut utiliser les méthodes de EntityQuery pour toutes vos requêtes
   * @return {Db}
   */
  db () {
    return this.definition.entities.db
  }

  /**
   * @callback Entity~entityCallback
   * @param {Error} error
   * @param {Entity} entity
   */
  /**
   * Stockage d'une instance d'entité
   * @param {Object} [options]
   * @param {boolean} [options.skipValidation]
   * @param {Entity~entityCallback}
   */
  store (options, callback) {
    const entity = this
    const def = this.definition

    if (_.isFunction(options)) {
      callback = options
      options = undefined
    }

    options = Object.assign({}, options, {object: true, index: true})

    callback = callback || function () {}

    let document
    flow().seq(function () {
      entity.beforeStore(this, options)
    }).seq(function () {
      let isNew = !entity.oid
      // on génère un oid sur les créations
      if (isNew) entity.oid = ObjectID().toString()
      // les index
      document = entity.buildIndexes()
      if (entity.__deletedAt) document.__deletedAt = entity.__deletedAt
      document._id = entity.oid
      document._data = entity.values()
      // {w:1} est le write concern par défaut, mais on le rend explicite (on veut que la callback
      // soit rappelée une fois que l'écriture est effective sur le 1er master)
      // @see https://docs.mongodb.com/manual/reference/write-concern/
      if (isNew) def.getCollection().insertOne(document, {w: 1}, this)
      // upsert devrait être omis ici car l'objet doit exister en base,
      // c'est au cas où qqun l'aurait supprimé depuis sa lecture
      else def.getCollection().replaceOne({_id: document._id}, document, {upsert: true, w: 1}, this)
    }).seq(function () {
      // suivant insert / replace
      // on récupère un http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~insertOneWriteOpResult
      // ou un http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#~updateWriteOpResult
      if (def._afterStore) {
        // faudrait appeler _afterStore avec l'entité telle qu'elle serait récupérée de la base,
        // on l'a pas directement sous la main mais entity devrait être identique en tout point
        // (on a généré l'oid s'il manquait)
        def._afterStore.call(entity, this)
      } else {
        this()
      }
    }).seq(function () {
      // On appelle le onLoad() car l'état de l'entité en BDD a changé,
      // comme si l'entity avait été "rechargée".
      entity.onLoad()
      callback(null, entity)
    }).catch(callback)
  }

  /**
   * Reconstruit les index (en fait un simple store avec $byPassDuplicate)
   * @param {Entity~entityCallback} callback
   */
  reindex (callback) {
    // faut pouvoir réindexer d'éventuel doublons pour mieux les trouver ensuite
    this.$byPassDuplicate = true
    this.store(callback)
  }

  /**
   * Restaure un élément supprimé par {@link Entity#softDelete}
   * @param {Entity~entityCallback} callback
   */
  restore (callback) {
    const entity = this
    const def = this.definition

    flow()
      .seq(function () {
        if (!entity.oid) return this('Impossible de restaurer une entité sans oid')
        def.getCollection().update({
          _id: entity.oid
        }, {
          $unset: {__deletedAt: ''} // la valeur '' ne change rien, cf https://docs.mongodb.com/manual/reference/operator/update/unset/
        }, this)
      })
      .seq(function () {
        // l'update mongo a fonctionné, il faut mettre à jour notre objet
        entity.__deletedAt = null
        // On appelle le onLoad() car l'état de l'entité en BDD a changé,
        // comme si l'entity avait été "rechargée".
        entity.onLoad()
        callback(null, entity)
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
   * Effectue une suppression "douce" de l'entité ({@link Entity#restore} pour la récupérer)
   * @param {Entity~entityCallback} callback
   */
  softDelete (callback) {
    if (!this.oid) return callback(new Error(`Impossible de softDelete une entité qui n'a pas encore été sauvegardée`))
    this.__deletedAt = new Date()
    this.store(callback)
  }

  /**
   * Efface cette instance d'entité en base (et ses index) puis appelle callback
   * avec une éventuelle erreur
   * @param {simpleCallback} callback
   */
  delete (callback) {
    const entity = this
    // @todo activer ce throw ?
    // if (!entity.oid) throw new Error('Impossible d’effacer une entity sans oid')
    if (!entity.oid) return callback()
    const def = this.definition
    flow().seq(function () {
      if (def._beforeDelete) def._beforeDelete.call(entity, this)
      else this()
    }).seq(function () {
      def.getCollection().remove({_id: entity.oid}, {w: 1}, callback)
    }).catch(callback)
  }
}

module.exports = Entity
