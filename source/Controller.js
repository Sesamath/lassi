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

var Action       = require('./Action');
var EventEmitter = require('events').EventEmitter
var _    = require('lodash');

/**
 * Cette classe est instanciée par {@link Component#controller}
 * @constructor
 */
class Controller extends EventEmitter {
  constructor(path) {
    super();
    this.path = '/' + (path || '');
    this.actions = [];
    return this;
  }

  on(methods, path, callback) {
    if (typeof callback === 'undefined') {
      callback = path;
      path = undefined;
    }
    if (methods && !_.isArray(methods)) methods = [ methods ];
    this.actions.push(new Action(this, methods, path, callback))
    return this;
  }

  /**
   * Évènement généré avant l'expédition des données
   * sur la couche de transport et avant que la couche
   * de transport ne soit déterminée via context.contentTYpe
   * @event Lassi#beforeTransport
   * @param {Context} context le context de la requête
   * @param {Object} data les données modifiables
   */

  /**
   * Réponse à une méthode PUT
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {Action~callback} cb La callback
   * @fires Lassi#beforeTransport
   * @return {Controller} Chaînable
   */
  put(path, cb) {
    this.on('put', path, cb);
    return this;
  }

  /**
   * Réponse à une méthode POST
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {Action~callback} cb La callback
   * @fires Lassi#beforeTransport
   * @return {Controller} Chaînable
   */
  post(path, cb) {
    return this.on('post', path, cb);
  }

  /**
   * Réponse à une méthode GET
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {Action~callback} cb La callback
   * @fires Lassi#beforeTransport
   * @return {Controller} Chaînable
   */
  get(path, cb) {
    return this.on('get', path, cb);
  }

  /**
   * Réponse à une méthode DELETE
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {Action~callback} cb La callback
   * @fires Lassi#beforeTransport
   * @return {Controller} Chaînable
   */
  delete(path, cb) {
    return this.on('delete', path, cb);
  }

  /**
   * Réponse à une méthode OPTIONS
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {Action~callback} cb La callback
   * @fires Lassi#beforeTransport
   * @return {Controller} Chaînable
   */
  options(path, cb) {
    return this.on('options', path, cb);
  }

  /**
   * Réponse à une méthode ALL
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {Action~callback} cb La callback
   * @fires Lassi#beforeTransport
   * @return {Controller} Chaînable
   */
  all(path, cb) {
    return this.on(undefined, path, cb);
  }


  /**
   * Publie l'ensemble des fichiers d'un dossier physique.
   * @param {String} [path] le chemin absolu ou relatif au controller .
   * @param {String|Object} options Si c'est une string ça doit être le chemin physique, sinon un objet avec fsPath ou d'autres propriétés qui seront passées à express.static
   * @return {Controller} Chaînable
   */
  serve(path, options) {
    if (typeof options==='undefined') {
      options = {fsPath: path}
      path = undefined;
    } else if (typeof options==='string') {
      options = {fsPath: options}
    }
    return this.on('get', path, options);
  }

}


module.exports = function(path) {
  return new Controller(path);
}
