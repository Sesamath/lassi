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
    this.entity = entity;
    this.clauses = [];
    this.search = null;
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
   * Limite les enregistrements dont la valeur (de l'index imposé précédemment) ressemble à une
   * valeur donnée (Cf signification du _ et % avec like).
   * @see https://dev.mysql.com/doc/refman/5.5/en/pattern-matching.html
   *
   * @param {String|Integer|Date} value La valeur cherchée
   * @return {EntityQuery} La requête (chaînable donc}
   */
  like (value) {
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
    return this.alterLastMatch({value: [from,to],  operator: 'BETWEEN'});
  }

  /**
   * Fait correspondre les enregistrement dont la valeur d'index est dans une liste
   *
   * @param {String[]|Integer[]|Date[]} value Les valeurs à faire correspondre.
   * @return {EntityQuery} La requête (chaînable donc}
   */
  in (values) {
    return this.alterLastMatch({value: values,  operator: 'IN'});
  }

  /**
   * Remonte les enregistrement dont les valeurs d'index ne sont pas dans la liste
   * @param {String[]|Integer[]|Date[]} value Les valeurs à exclure
   * @return {EntityQuery}
   */
  notIn (values) {
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
   * Remonte les entités softDeleted après when
   * @param {Date} when
   * @return {EntityQuery}
   */
  deletedAfter (when) {
    this.clauses.push({type:'match', index: '__deletedAt', operator: '>', value: when});
    return this
  }

  /**
   * Remonte les entités softDeleted avant when (<=)
   * @param {Date} when
   * @return {EntityQuery}
   */
  deletedBefore (when) {
    this.clauses.push({type:'match', index: '__deletedAt', operator: '<', value: when});
    return this
  }

  /**
   * Applique les clauses  à la requête.
   * @param {KnexQuery} query La requête à altérer.
   * @return {KnexQuery} la requête modifiée
   * @private
   */
  buildQuery (rec) {
    var query = rec.query;
    this.clauses.forEach((clause) => {
      if (clause.type == 'sort') {
        rec.options.sort = rec.options.sort || [];
        rec.options.sort.push([clause.index, clause.order]);
        return;
      }

      if (clause.type != 'match') return;
      var index = clause.index, type;
      if (clause.index == 'oid') {
        index = '_id';
        type = 'string';
      } else if (clause.index == '__deletedAt') {
        index = '__deletedAt';
        type = 'date';
      } else {
        type = this.entity.indexes[index].fieldType;
      }

      function cast (value) {
        switch (type) {
          case 'boolean': value = !!value; break;
          case 'string': value = String(value); break;
          case 'integer': value =  Math.round(Number(value)); break;
          case 'date':
            if (!(value instanceof Date)) {
              value = new Date(value);
            }
            break;
          default: throw new Error('type d’index ' + type + ' non géré par Entity'); break;
        }
        return value;
      }
      if (!clause.operator) return;

      var condition;
      switch (clause.operator) {
        case '=':
          condition = {$eq: cast(clause.value)};
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
          condition = {$nin: clause.value.map(x=>{return cast(x)})};
          break;

        case 'IN':
          condition = {$in: clause.value.map(x=>{return cast(x)})};
          break;

        default:
          log.error(new Error(`operator ${clause.operator} unknown`))
      }

      // On ajoute la condition
      if (!query[index]) query[index] = {};
      Object.assign(query[index], condition);
    })

    // Par défaut, on ne prend pas les softDeleted
    if (!query['__deletedAt']) query['__deletedAt'] = {$eq : null}
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

  createEntitiesFromRows (rows) {
    var dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    var jsonReviver = function (key, value) {
      if (typeof value === 'string' && dateRegExp.exec(value)) {
        return new Date(value);
      }
      return value;
    }

    return rows.map((row) => {
      var data = JSON.parse(row._data, jsonReviver)
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

  grab (options, callback) {
    if (_.isFunction(options)) {
      callback = options
      options = {};
    }
    if (typeof options == 'number') {
      options = {limit : options}
    }
    options = options || {};
    var record = {query: {}, options: {}};
    // on accepte offset ou skip
    const skip = options.offset || options.skip
    if (skip > 0) record.options.skip = skip;

    let limit;
    if (options.limit > 0 && options.limit < hardLimit) {
      limit = options.limit;
      delete options.limit;
    } else {
      limit = hardLimit;
    }

    var self = this;
    self.buildQuery(record);

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
      this.entity.getCollection()
      .find(recordQuery, recordOptions)
      .sort(recordSort)
      .limit(limit)
      .toArray(function (error, rows) {
        callback(error, self.createEntitiesFromRows(rows));
      });
    } else {
      this.entity.getCollection()
      .find(record.query, record.options)
      .limit(limit)
      .toArray(function (error, rows) {
        callback(error, self.createEntitiesFromRows(rows));
      });
    }
  }

  /**
   * Callback d'exécution d'une requête.
   * @callback EntityQuery~CountCallback
   * @param {Error} error Une erreur est survenue.
   * @param {Integer} count compote
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
   * Callback d'exécution d'une requête.
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
