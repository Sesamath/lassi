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

lassi.Class('lfw.entities.Definition', {
  construct: function (entityClass) {
    this.indexes = {};
    this.listeners = {};
    this.entityClass = entityClass;
  },

  /**
   * Ajoute un indexe à l'entité. Contrairement à la logique SGBD, on ne type pas
   * l'indexe. En réalité il faut comprendre un index comme "Utilise la valeur du
   * champ XXX et indexe-la".
   *
   * Une callback peut être fournie pour fabriquer des valeurs virtuelles. Par exemple :
   * ```javascript
   *  entity.index('age', 'integer', function() {
   *    return (new Date()).getFullYear() - this.born.getFullYear();
   *  });
   * ```
   *
   * @param {String} fieldName Nom du champ à indexer
   * @param {String} fieldType Type du champ à indexer ('integer', 'string', 'date')
   * @param {Function} callback Cette fonction permet de définir virtuellement la valeur d'un index.
   * @return {Entity} l'entité (chaînable)
   */
  defineIndex: function(fieldName, fieldType, callback) {
    this.indexes[fieldName] = {
      callback: callback?callback:function() { return this[fieldName]; },
      fieldType: fieldType
    };
    return this;
  },

  /**
   * Indique quelle nom de table utiliser pour cette entité. Par défaut il
   * s'agira de la version underscore de la classe de l'entité (ex. mon_entite
   * pour MonEntite)
   * @param {String} table le nom de la table
   * @return {Entity} l'entité (chaînable)
   */
  useTable: function(table) {
    this.table = table;
    return this;
  },

  /**
   * Ajoute un listener sur un évènement donné.
   * @param {String} event L'évènement à écouter.
   * @param {SimpleCallback} callback La callback
   * @return {Entity} l'entité (chaînable)
   */
  on: function(event, callback) {
    if (!this.on[event]) this.listeners[event] = new lfw.tools.Callbacks();
    this.listeners[event].do(callback);
    return this;
  },

  /**
   * Finalisation de l'objet Entité.
   * @param {Entities} entities le conteneur d'entités.
   * @return {Entity} l'entité (chaînable)
   */
  bless: function(entities) {
    if (this.configure) this.configure();
    this.entities = entities;
    this.name = this.entityClass.name;
    this.table = this.table || lassi.tools.toUnderscore(this.name);
    /*
    if(!this.entityClass.prototype.hasOwnProperty('__fullClassName')) {
      this.entityClass.prototype.__proto__ = lfw.entities.Entity.prototype;
      for(var staticName in this.entityClass) {
        lassi.assert.not.defined(this[staticName], "Vous ne pouvez pas redéfinir une proptiété d'Entity : "+staticName);
        this[staticName] = this.entityClass[staticName];
        delete this.entityClass[staticName];
      }
    }*/
    return this;
  },

  /**
   * Retourne une nouvelle instance de l'entité
   * @param {Object=} values Des valeurs à injecter dans l'objet.
   * @return {lfw.entities.Entity} Une instance d'entité
   */
  create: function(values) {
    var instance = new this.entityClass();
    instance.setDefinition(this);
    if (values) lassi.tools.update(instance, values);
    return instance;
  },
  /**
   * Retourne un requeteur (sur lequel on pourra chaîner les méthodes de {@link EntityQuery})
   * @param {String=} index Un indexe à matcher en premier.
   * @return {EntityQuery}
   */
  match: function() {
    var query = new lfw.entities.Query(this);
    if (arguments.length) query.match.apply(query, Array.prototype.slice.call(arguments));
    return query;
  },

  /**
   * Raccourcis vers .match().{@link EntityQuery.grab|grab}()
   */
  grab: function() {
    var query = this.match();
    query.grab.apply(query, Array.prototype.slice.call(arguments));
  },

  /**
   * Raccourcis vers .match().{@link EntityQuery.grabOne|grabOne}()
   */
  grabOne: function() {
    var query = this.match();
    query.grabOne.apply(query, Array.prototype.slice.call(arguments));
  },

  /**
   * Raccourcis vers .match().{@link EntityQuery.sort|sort}()
   * @return {EntityQuery}
   */
  sort: function() {
    var query = this.match();
    return query.sort.apply(query, Array.prototype.slice.call(arguments));
  }
});
