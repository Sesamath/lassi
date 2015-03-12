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

var _            = require('underscore')._;
var Action       = require('./Action');
var util         = require('util');
var EventEmitter = require('events').EventEmitter

/**
 * Cette classe est instanciée par {@link Component#controller}
 * @constructor
 */
function Controller(path) {
  this.path = '/' + (path || '');
  this.actions = [];
  return this;
}
util.inherits(Controller, EventEmitter)

Controller.prototype.on = function(methods, path, callback) {
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
Controller.prototype.put = function(path, cb) {
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
Controller.prototype.post = function(path, cb) {
  return this.on('post', path, cb);
}

/**
 * Réponse à une méthode GET
 * @param {String} [path] le chemin absolu ou relatif au controller .
 * @param {Action~callback} cb La callback
 * @fires Lassi#beforeTransport
 * @return {Controller} Chaînable
 */
Controller.prototype.get = function(path, cb) {
  return this.on('get', path, cb);
}

/**
 * Réponse à une méthode DELETE
 * @param {String} [path] le chemin absolu ou relatif au controller .
 * @param {Action~callback} cb La callback
 * @fires Lassi#beforeTransport
 * @return {Controller} Chaînable
 */
Controller.prototype.delete = function(path, cb) {
  return this.on('delete', path, cb);
}

/**
 * Réponse à une méthode OPTIONS
 * @param {String} [path] le chemin absolu ou relatif au controller .
 * @param {Action~callback} cb La callback
 * @fires Lassi#beforeTransport
 * @return {Controller} Chaînable
 */
Controller.prototype.options = function(path, cb) {
  return this.on('options', path, cb);
}

/**
 * Réponse à une méthode ALL
 * @param {String} [path] le chemin absolu ou relatif au controller .
 * @param {Action~callback} cb La callback
 * @fires Lassi#beforeTransport
 * @return {Controller} Chaînable
 */
Controller.prototype.all = function(path, cb) {
  return this.on(undefined, path, cb);
}


/**
 * Publie l'ensemble des fichiers d'un dossier physique.
 * @param {String} [path] le chemin absolu ou relatif au controller .
 * @param {String} fsPath Le chemin physique
 * @return {Controller} Chaînable
 */
Controller.prototype.serve = function(path, fsPath) {
  return this.on('get', path, fsPath);
}

module.exports = function(path) {
  return new Controller(path);
}
