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

'use strict';

const log = require('an-log')('EntityQuery');
const _    = require('lodash');
const flow = require('an-flow');

// une limite hard pour grab
const hardLimit = 1000

/**
 * cast de value en type
 * @param {*} value
 * @param {string} type boolean|string|integer|date
 * @return {*} value mise dans le type voulu
 * @throws si le type n'est pas boolean|string|integer|date
 */
function castToType (value, type) {
  if (typeof value === type) return value
  switch (type) {
    case 'boolean': value = !!value; break;
    case 'string': value = String(value);break;
    case 'integer': value =  Math.round(Number(value));break;
    case 'date':
      if (!(value instanceof Date)) {
        value = new Date(value);
      }
      break;
    default: throw new Error(`le type d’index ${type} n’est pas géré par Entity`); break;
  }
  return value;
}

/**
 * Vérifie que value est un array
 * @private
 * @param value
 * @throws si value invalide
 */
function checkArray (value) {
  if (!Array.isArray(value)) throw new Error('paramètre de requête invalide (Array obligatoire)')
}

/**
 * Vérifie que value n'est pas falsy (sauf qui est 0 accepté)
 * @private
 * @param value
 */
function checkCompareValue (value) {
  // le seul falsy qui est valable pour une comparaison
  if (value === 0) return
  // Et en attendant plus précis, on refuse tous les autres falsy
  if (!value) throw new Error('paramètre de requête invalide')
}

/**
 * Vérifie que value n'est pas falsy
 * @private
 * @param value
 */
function checkDate (value) {
  // on accepte tout sauf falsy
  if (!value) throw new Error('paramètre de requête invalide (date voulue)')
}

// @todo documenter proprement tous les arguments et les callbacks
class EntityQuery {
  /**
   * Construction d'une requête sur entité.
   * Ce constructeur n'est jamais appelé directement. Utilisez
   * {@link Entity#match}
   *
   * @constructor
   * @param {Entity} entity L'entité
   */
  constructor (entity) {
    /**
     * La définition de l'entité
     * @type {EntityDefinition}
     */
    this.entity = entity;
    this.clauses = [];
    this.search = null;
    this._includeDeleted = false;
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est égale à une
   * valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (chaînable donc}
   */
  equals (value, fieldValue) {
    if (typeof fieldValue !== 'undefined') {
      this.match(value);
      value = fieldValue;
    }
    return this.alterLastMatch({value: value,  operator: '='});
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est différente à une
   * valeur donnée.
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (chaînable donc}
   */
  notEquals (value, fieldValue) {
    if (typeof fieldValue !== 'undefined') {
      this.match(value);
      value = fieldValue;
    }
    return this.alterLastMatch({value: value,  operator: '<>'});
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) ressemble à une
   * valeur donnée (Cf signification du _ et % avec like).
   * @see https://dev.mysql.com/doc/refman/5.5/en/pattern-matching.html
   *
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (chaînable donc}
   */
  like (value) {
    checkCompareValue(value)
    return this.alterLastMatch({value: value,  operator: 'LIKE'});
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est vraie.
   *
   * @return {EntityQuery} La requête (chaînable donc}
   */
  true () {
    return this.equals(true);
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est fausse.
   *
   * @return {EntityQuery} La requête (chaînable donc}
   */
  false () {
    return this.equals(false);
  }

  isNull () {
    return this.alterLastMatch({operator: 'ISNULL'});
  }

  isNotNull () {
    return this.alterLastMatch({operator: 'ISNOTNULL'});
  }

  /**
   * @alias equals
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  with (value) {
    return this.alterLastMatch({value: value,  operator: '='});
  }

  /**
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est supérieure à une
   * valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  greaterThan (value) {
    checkCompareValue(value)
    return this.alterLastMatch({value: value,  operator: '>'});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index supérieure à une
   * date donnée.
   * @alias greaterThan
   *
   * @param {Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  after (value) {
    checkDate(value)
    return this.alterLastMatch({value: value,  operator: '>'});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est inférieure à une
   * valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  lowerThan (value) {
    checkCompareValue(value)
    return this.alterLastMatch({value: value,  operator: '<'});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est inférieure à une
   * date donnée.
   * @alias lowerThan
   *
   * @param {Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  before (value) {
    checkDate(value)
    return this.alterLastMatch({value: value,  operator: '<'});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est supérieure ou
   * égale à une valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  greaterThanOrEquals (value) {
    checkCompareValue(value)
    return this.alterLastMatch({value: value,  operator: '>='});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est inférieure ou
   * égale à une valeur donnée.
   *
   * @param {String|Integer|Date} value La valeur à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  lowerThanOrEquals (value) {
    checkCompareValue(value)
    return this.alterLastMatch({value: value,  operator: '<='});
  }

  /**
   * Ajoute un critère à la requête.
   *
   * Si cette directive est utilisée seule, cela permet de faire correspondre les
   * objets qui disposent de cet index quel que soit sa valeur. Sinon cette
   * directive est généralement suivi d'une condition comme {@link EntityQuery#in|in},
   * {@link EntityQuery#greaterThan|greaterThan}, etc.
   *
   * ##### examples
   * Sélection des personnes qui ont un index "job"
   * ```javascript
   * lassi.entity.Person.match('job');
   * ```
   *
   * Sélection des personnes de plus de 30 ans :
   * ```javascript
   * lassi.entity.Person.match('age').greaterThan(30);
   * ```
   *
   * @param {String} index L'index tel que déclaré via {@link Entity#addIndex} ou
   * `oid` pour l'identifiant de l'objet.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  match (index) {
    this.clauses.push({type:'match', index: index});
    return this;
  }

  /**
   * Helper permettant d'altérer la dernière clause.
   * @param {Object} data les données à injecter.
   * @return {EntityQuery} Chaînable
   * @private
   */
  alterLastMatch (data) {
    _.extend(this.clauses[this.clauses.length - 1], data);
    return this;
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est comprise
   * entre deux valeurs.
   *
   * @param {String|Integer|Date} from La valeur de la borne inférieure
   * @param {String|Integer|Date} to La valeur de la borne supérieure
   * @return {EntityQuery} La requête (chaînable donc}
   */
  between (from, to) {
    checkDate(from)
    checkDate(to)
    return this.alterLastMatch({value: [from,to],  operator: 'BETWEEN'});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est dans une liste
   *
   * @param {String[]|Integer[]|Date[]} value Les valeurs à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  in (values) {
    checkArray(values)
    // cette vérif est souvent oubliée avant l'appel, on throw plus pour ça mais faudrait toujours le tester avant l'appel
    if (!value.length) console.error(new Error('paramètre de requête invalide (in veut un Array non vide)'), this.clauses)
    return this.alterLastMatch({value: values,  operator: 'IN'});
  }

  /**
   * Remonte les enregistrement dont les valeurs d'index ne sont pas dans la liste
   * @param {String[]|Integer[]|Date[]} value Les valeurs à exclure
   * @return {EntityQuery}
   */
  notIn (values) {
    checkArray(values)
    return this.alterLastMatch({value: values,  operator: 'NOT IN'});
  }

  /**
   * Remonte uniquement les entités softDeleted (inutile avec deletedAfter ou deletedBefore)
   * @return {EntityQuery}
   */
  onlyDeleted () {
    this.clauses.push({type:'match', index: '__deletedAt', operator: 'ISNOTNULL'});
    return this
  }

  /**
   * Remonte uniquement toutes les entités softdeleted ou non
   * @return {EntityQuery}
   */
  includeDeleted() {
    this._includeDeleted = true;
    return this
  }

  /**
   * Remonte les entités softDeleted après when
   * @param {Date} when
   * @return {EntityQuery}
   */
  deletedAfter (when) {
    checkDate(when)
    this.clauses.push({type:'match', index: '__deletedAt', operator: '>', value: when});
    return this
  }

  /**
   * Remonte les entités softDeleted avant when (<=)
   * @param {Date} when
   * @return {EntityQuery}
   */
  deletedBefore (when) {
    checkDate(when)
    this.clauses.push({type:'match', index: '__deletedAt', operator: '<', value: when});
    return this
  }

  /**
   * Applique les clauses pendantes à la requête courante
   * @param {EntityQuery~record} record
   * @private
   */
  buildQuery (record) {
    var query = record.query;

    this.clauses.forEach((clause) => {
      if (!clause) throw new Error('Erreur interne, requête invalide')
      if (clause.type === 'sort') {
        record.options.sort = record.options.sort || [];
        record.options.sort.push([clause.index, clause.order]);
        return;
      }

      if (clause.type !== 'match') return;

      var index = clause.index;
      var type;

      if (index === 'oid') {
        index = '_id';
        type = 'string';
      } else if (index === '_id') {
        type = 'string';
      } else if (index === '__deletedAt') {
        type = 'date';
      } else if (this.entity.indexes[index]) {
        type = this.entity.indexes[index].fieldType;
      } else {
        throw new Error(`L’entity ${this.entity.name} n’a pas d’index ${index}`)
      }

      const cast = x => castToType(x, type)

      if (!clause.operator) return;

      var condition;
      switch (clause.operator) {
        case '=':
          condition = {$eq: cast(clause.value)};
          break;

        case '<>':
          condition = {$ne: cast(clause.value)};
          break;

        case '>':
          condition = {$gt: cast(clause.value)};
          break;

        case '<':
          condition = {$lt: cast(clause.value)};
          break;

        case '>=':
          condition = {$gte: cast(clause.value)};
          break;

        case '<=':
          condition = {$lte: cast(clause.value)};
          break;

        case 'BETWEEN':
          condition = {$gte: cast(clause.value[0]), $lte: cast(clause.value[1])};
          break;

        case 'LIKE':
          condition = {$regex: new RegExp(cast(clause.value).replace(/\%/g,'.*'))};
          break;

        case 'ISNULL':
          condition = {$eq: null};
          break;

        case 'ISNOTNULL':
          condition = {$ne: null};
          break;

        case 'NOT IN':
          condition = {$nin: clause.value.map(cast)};
          break;

        case 'IN':
          condition = {$in: clause.value.map(cast)};
          break;

        default:
          log.error(new Error(`operator ${clause.operator} unknown`))
      }

      // On ajoute la condition
      if (!query[index]) query[index] = {};
      Object.assign(query[index], condition);
    })

    // par défaut on prend pas les softDeleted
    if (!query['__deletedAt'] && !this._includeDeleted) query['__deletedAt'] = {$eq : null}
  }

  /**
   * @typedef EntityQuery~record
   * @property {EntityQuery~query} query
   * @property {number} limit toujours fourni, hardLimit par défaut
   * @property {object} options sera passé tel quel à mongo
   * @property {number} options.skip Offset pour un find
   */
  /**
   * Prépare la requête pour un find ou un delete (helper de grab ou purge)
   * @param {object} options
   */
  prepareRecord (options) {
    if (options) { // null est de type object…
      if (typeof options == 'number') {
        options = {limit: options}
      } else if (typeof options !== 'object') {
        log.error(new Error('options invalides'), options)
        options = {}
      }
    } else {
      options = {}
    }
    const record = {query: {}, options: {}, limit: hardLimit};
    // on accepte offset ou skip
    const skip = options.offset || options.skip
    if (skip > 0) record.options.skip = skip;
    // set limit
    if (options.limit) {
      if (options.limit > 0 && options.limit <= hardLimit) {
        record.limit = options.limit;
      } else {
        log.error(`limit ${options.limit} trop élevée, ramenée au max admis ${hardLimit} (hardLimit)`)
      }
    }

    this.buildQuery(record);
    return record;
  }

  /**
   * Tri le résultat de la requête.
   * @param {String} index L'index sur lequel trier
   * @param {String=} [order=asc] Comme en SQL, asc ou desc.
   * @return {EntityQuery} chaînable
   */
  sort (index, order) {
    order = order || 'asc';
    this.clauses.push({type: 'sort', index: index, order: order});
    return this;
  }

  /**
   * (Internal) Retourne un tableau d'entities à partir d'un array de documents mongo
   * @param {Array} rows
   * @return {Entity[]}
   * @throws Si _data n'est pas du json valide
   */
  createEntitiesFromRows (rows) {
    // on veut des objets date à partir de strings qui matchent ce pattern de date.toString()
    const dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    const jsonReviver = (key, value) => (typeof value === 'string' && dateRegExp.exec(value)) ? new Date(value) : value

    return rows.map((row) => {
      let data
      if (row._data) {
        try {
          data = JSON.parse(row._data, jsonReviver)
        } catch (error) {
          console.error(error, 'avec les _data', row._data)
          // on renvoie un message plus compréhensible
          throw new Error(`Données corrompues pour ${this.entity.name}/${row._id}`)
        }
      } else {
        throw new Error(`Données corrompues pour ${this.entity.name}/${row._id}`)
      }
      data.oid = row._id.toString();
      // __deletedAt n'est pas une propriété de _data, c'est un index ajouté seulement quand il existe (par softDelete)
      if (row.__deletedAt) {
        data.__deletedAt = row.__deletedAt;
      }

      return this.entity.create(data);
    });
  }

  textSearch (search) {
    this.search = search;
    return this;
  }

  /**
   * Callback d'exécution d'une requête grab
   * @callback EntityQuery~GrabCallback
   * @param {Error} error
   * @param {Array} entities La liste des entités remontées
   */

  /**
   * Récupère des entités
   * @param {number|object}           [options]      Si seulement un nombre est fourni, il sera traité comme options.limit
   * @param {number}                   options.limit Entier >0 et < 1000
   * @param {number}                   options.skip  Entier >0, pour démarrer avec un offset
   * @param {EntityQuery~GrabCallback} callback rappelée avec l'erreur ou les résultats
   */
  grab (options, callback) {
    if (_.isFunction(options)) {
      callback = options
      options = {};
    }
    const record = this.prepareRecord(options);
    let query;

    if (this.search) {
      let sorts = {};
      _.each(record.options.sort, (sort) => {
        sorts[sort[0]] = sort[1] === 'asc' ? 1 : -1;
      });
      // Le sort sur le score doit être fait avant les sorts "classiques"
      let recordSort = _.merge({score: {$meta: 'textScore'}}, sorts);
      delete record.options.sort;

      let recordQuery = _.merge(record.query, {$text: {$search: this.search}});
      let recordOptions = _.merge(record.options, {score: {$meta: 'textScore'}});

      query = this.entity.getCollection()
        .find(recordQuery, recordOptions)
        .sort(recordSort);
     } else {
      query = this.entity.getCollection()
        .find(record.query, record.options);
    }

    query.limit(record.limit)
      .toArray((error, rows) => {
        if (error) return callback(error)
        if (rows.length === hardLimit) log.error('hardLimit atteint avec', record)
        try {
          callback(null, this.createEntitiesFromRows(rows));
        } catch (error) {
          callback(error)
        }
      });
  }

  /**
   * @callback purgeCallback
   * @param {Error} error
   * @param {number} le nb d'objets effacés
   */
  /**
   * Efface toutes les entités de la collection (qui matchent la requête si y'en a une qui précède)
   * @param {purgeCallback} callback
   */
  purge (callback) {
    const record = this.prepareRecord();
    this.entity.getCollection()
      .deleteMany(record.query, null, function (error, result) {
        if (error) return callback(error)
        // on ajoute ça pour comprendre dans quel cas deleteMany ne remonte pas de deletedCount
        if (!result) {
          console.error('deleteMany ne remonte pas de result dans purge, avec', record.query)
        } else if (!result.hasOwnProperty('deletedCount')) {
          if (result.ok === 1) {
            console.error('deleteMany remonte un result avec ok=1 mais pas de deletedCount, avec la query', record.query)
          } else {
            console.error('deleteMany remonte un result sans deletedCount', result, 'avec la query', record.query)
          }
        } else if (!result.deletedCount) {
          console.error('deleteMany remonte un result avec deletedCount falsy', result, 'avec la query', record.query)
        }
        const deletedCount = (result && result.deletedCount) || (result && result.result && result.result.n) || 0
        callback(null, deletedCount)
      });
  }

  /**
   * Callback d'exécution d'une requête.
   * @callback EntityQuery~CountCallback
   * @param {Error} error Une erreur est survenue.
   * @param {Integer} count le nb de résultat
   */

  /**
   * Compte le nombre d'objet correpondants.
   * @param {EntityQuery~CountCallback} callback
   */
  count (callback) {
    var self = this;
    var record = {query: {}, options: {}};

    flow()
    .seq(function () {
      self.buildQuery(record);
      self.entity.getCollection().count(record.query, record.options, this);
    })
    .done(callback);
  }

  /**
   * Callback d'exécution d'une requête grabOne
   * @callback EntityQuery~GrabOneCallback
   * @param {Error} error Une erreur est survenue.
   * @param {Entity} entites L'objet trouvé (ou null)
   */

  /**
   * Renvoie un objet liés à la requête
   * @param {EntityQuery~GrabOneCallback} callback La callback.
   */
  grabOne (callback) {
    this.grab({limit: 1}, function (error, entities) {
      if (error) return callback(error);
      if (entities.length === 0) return callback();
      callback(null, entities[0])
    });
  }
}

module.exports = EntityQuery;
