'use strict';
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
var _    = require('lodash');
var util = require('util');
var log  = require('an-log')('$entities');

function DatabaseQuery() { this._buffer = []; }

DatabaseQuery.prototype.push = function(text) {
  text = util.format.apply(this, Array.prototype.slice.call(arguments));
  this._buffer.push(text);
}

DatabaseQuery.prototype.toString = function(separator) {
  separator = separator || "\n";
  return this._buffer.join(separator);
}


/**
 * Construction d'une requête sur entité.
 * Ce constructeur n'est jamais appelé directement. Utilisez
 * {@link Entity#match}
 *
 * @constructor
 * @param {Entity} entity L'entité
 */
function EntityQuery(entity) {
  this.entity = entity;
  this.references = 0;
  this.clauses = [];
  this.sorts = [];
  this.joins = [];
}

/**
 * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est égale à une
 * valeur donnée.
 *
 * @param {String|Integer|Date} value La valeur cherchée
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.equals = function(value) {
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
EntityQuery.prototype.like = function(value) {
  return this.alterLastMatch({value: value,  operator: 'LIKE'});
}

/**
 * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est vraie.
 *
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.true = function() {
  return this.equals(true);
}

/**
 * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est fausse.
 *
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.false = function() {
  return this.equals(false);
}

/**
 * @alias equals
 *
 * @param {String|Integer|Date} value La valeur à faire correspondre.
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.with = function(value) {
  return this.alterLastMatch({value: value,  operator: '='});
}

/**
 * Limite les enregistrements dont la valeur (de l'index imposé précédemment) est supérieure à une
 * valeur donnée.
 *
 * @param {String|Integer|Date} value La valeur à faire correspondre.
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.greaterThan = function(value) {
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
EntityQuery.prototype.after = function(value) {
  return this.alterLastMatch({value: value,  operator: '>'});
}

/**
 * Fait correspondre les enregistrement dont la valeur d'index est inférieure à une
 * valeur donnée.
 *
 * @param {String|Integer|Date} value La valeur à faire correspondre.
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.lowerThan = function(value) {
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
EntityQuery.prototype.before = function(value) {
  return this.alterLastMatch({value: value,  operator: '<'});
}

/**
 * Fait correspondre les enregistrement dont la valeur d'index est supérieure ou
 * égale à une valeur donnée.
 *
 * @param {String|Integer|Date} value La valeur à faire correspondre.
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.greaterThanOrEquals = function(value) {
  return this.alterLastMatch({value: value,  operator: '>='});
}

/**
 * Fait correspondre les enregistrement dont la valeur d'index est inférieure ou
 * égale à une valeur donnée.
 *
 * @param {String|Integer|Date} value La valeur à faire correspondre.
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.lowerThanOrEquals = function(value) {
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
EntityQuery.prototype.match = function(index) {
  this.clauses.push({type:'match', index: index, value:'*'});
  return this;
}

/**
 * Helper permettant d'altérer la dernière clause.
 * @param {Object} data les données à injecter.
 * @return {EntityQuery} Chaînable
 * @private
 */
EntityQuery.prototype.alterLastMatch = function(data) {
  _.extend(this.clauses[this.clauses.length-1], data);
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
EntityQuery.prototype.between = function(from, to) {
  return this.alterLastMatch({value: [from,to],  operator: 'BETWEEN'});
}

/**
 * Fait correspondre les enregistrement dont la valeur d'index est dans une liste
 *
 * @param {String[]|Integer[]|Date[]} value Les valeurs à faire correspondre.
 * @return {EntityQuery} La requête (chaînable donc}
 */
EntityQuery.prototype.in = function(values) {
  return this.alterLastMatch({value: values,  operator: 'IN'});
}

/**
 * Applique les clauses  à la requête.
 * @param {KnexQuery} query La requête à altérer.
 * @return {KnexQuery} la requête modifiée
 * @private
 */
EntityQuery.prototype.finalizeQuery = function(query) {
  var i, clause, record;
  query.args = [];

  // Construction des jointures
  var alias_index = 0;
  for (i in this.clauses) {
    clause = this.clauses[i];
    if (clause.index != 'oid') {
      record = this.entity.indexes[clause.index];
      if (!record) throw new Error("L'index "+clause.index+" est inconnu sur l'entité "+this.entity.name);
      clause.alias = '_'+(alias_index++);
      query.push('JOIN %s AS %s ON %s.oid=d.oid', this.entity.table+'_index', clause.alias, clause.alias);
      clause.field = clause.alias+'._'+record.fieldType;
    } else {
      clause.field = 'd.oid';
    }
  }

  // Construction des conditions
  if (this.clauses.length) {
    var init = false;
    var where = new DatabaseQuery();
    _.each(this.clauses, function(clause) {
      if (!init && clause.type!=='sort') {
        query.push('WHERE');
        init = true;
      }
      if (clause.index != 'oid') {
        where.push("%s.name=?", clause.alias);
        query.args.push(clause.index);
      }

      if (clause.value == '*') return;
      if (clause.type != 'match') return;

      switch (clause.operator) {
        case '>':case'<':case'>=':case'<=':case'=':
          where.push('%s %s ?', clause.field, clause.operator);
          query.args.push(clause.value);
          break;

        case 'BETWEEN':
          where.push('%s BETWEEN ? AND ?', clause.field);
          query.args.push(clause.value[0]);
          query.args.push(clause.value[1]);
          break;

        case 'LIKE':
          where.push('%s LIKE ?', clause.field);
          query.args.push(clause.value);
          break;


        case 'IN':
          var keys = [];
          _.each(clause.value, function(value) {
            keys.push('?');
            query.args.push(value);
          });
          where.push('%s IN (%s)', clause.field, keys.join(','));
          break;
      }
    });
    query.push(where.toString(' AND\n  '));
  }

  // Tris
  for (i in this.clauses) {
    clause = this.clauses[i];
    if (clause.type!='sort') continue;
    query.push('ORDER BY %s %s', clause.field, clause.order);
  }
}

/**
 * Tri le résultat de la requête.
 * @param {String} index L'index sur lequel trier
 * @param {String=} [order=asc] Comme en SQL, asc ou desc.
 * @return {EntityQuery} chaînable
 */
EntityQuery.prototype.sort = function(index, order) {
  order = order || 'asc';
  this.clauses.push({type: 'sort', index: index, order:order});
  return this;
}

/**
 * Callback d'exécution d'une requête de récupération d'entités
 * @callback EntityQuery~GrabCallback
 * @param {Error} error Une erreur est survenue.
 * @param {Entity[]} entites Un tableau d'entités.
 */

/**
 * Renvoie les objets liés à la requête
 * @param {Integer} [count=0] Ne récupère que les ̀count` objet(s), tous par défaut
 * @param {Integer} [from=0] Ne récupère que les objets à partir d'un rang donné
 * @param {EntityQuery~GrabCallback} callback La callback.
 *
 * ##### examples
 * Récupère toutes les personnes âgées de plus de 30 ans.
 * ```javascript
 *  lassi.Person
 *    .match('age').greaterThat(30)
 *    .grab(function(error, entities) {
 *  })
 * ```
 *
 * Récupère les 10 personnes les plus âgées
 * ```javascript
 *  lassi.Person.match()
 *    .sort('age', 'desc')
 *    .grab(10, function(error, entities) {
 *  })
 * ```
 *
 * Récupère 10 personnes, de la 21e plus agée à la 30e
 * ```javascript
 *  lassi.Person.match()
 *   .sort('age', 'desc')
 *   .grab(10, 20, function(error, entities) {
 *  })
 * ```
 *
 * @fires EntityQuery#afterLoad
 */
EntityQuery.prototype.grab = function(count, from, callback) {
  var dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
  if (_.isFunction(count)) {
    callback = count;
    count = from = 0;
  } else if (_.isFunction(from)) {
    callback = from;
    from = 0;
  }
  var _this = this;
  var query = new DatabaseQuery();
  query.push('SELECT * FROM %s AS d', this.entity.table);
  this.finalizeQuery(query);
  if (count) {
    query.push('LIMIT %d', count);
    query.push('OFFSET %d', from);
  }

  console.log(log);
  if (log.logDebug) {
    var i = 0;
    log.debug("grab", "\n"+query.toString().replace(/\?/g, function () {
      var arg = query.args[i++];
      return (typeof arg === "number") ? arg : "'" +arg +"'";
    }));
  }
  this.entity.entities.database.query(query.toString(), query.args, function(errors, rows) {
    if (errors) return callback(errors);
    for(var i=0,ii=rows.length; i<ii; i++) {
      var tmp = JSON.parse(rows[i].data, function (key, value) {
        if (typeof value === 'string' && dateRegExp.exec(value)) {
          return new Date(value);
        }
        return value;
      });
      tmp.oid = rows[i].oid;
      rows[i] = _this.entity.create(tmp);
    }
    callback(null, rows);
  });
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
EntityQuery.prototype.count = function(callback) {
  var query = new DatabaseQuery();
  query.push('SELECT COUNT(d.oid) AS count FROM %s AS d', this.entity.table);
  this.finalizeQuery(query);
  this.entity.entities.database.query(query.toString(), query.args, function(error, rows) {
    if (error) return callback(error);
    if ((rows.length===0) || (!rows[0].hasOwnProperty('count'))) return callback(new Error('Erreur dans la requête de comptage : pas de résultat'));
    callback(null, rows[0].count);
  });
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
EntityQuery.prototype.grabOne = function(callback) {
  this.grab(1, function(error, entities) {
    if (error) return callback(error);
    if (entities.length===0) return callback();
    callback(null, entities[0])
  });
}

module.exports = EntityQuery;
