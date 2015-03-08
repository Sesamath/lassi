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
var _ = require('underscore')._;

/**
 * Contexte d'exécution d'une action.
 * @param {Request} request la requête Express.
 * @param {Response} response la réponse Express.
 * @constructor
 */
function Context(request, response) {
  this.request      = request;
  this.response     = response;
  this.method       = request.method.toLowerCase();
  this.get          = this.request.query;
  this.post         = this.request.body;
  this.session      = this.request.session;
  this.user         = this.request.user;
}

/**
 * Détermine si la requête comporte des arguments Get
 * @return {Boolean} vrai si c'est le cas.
 */
Context.prototype.hasGet = function () { return !_.isEmpty(this.get) }



/**
 * Détermine si la requête comporte des arguments Post
 * @return {Boolean} vrai si c'est le cas.
 */
Context.prototype.hasPost = function() { return !_.isEmpty(this.post) }

/**
 * Détermine si la requête est de type Get
 * @return {Boolean} vrai si c'est le cas.
 */
Context.prototype.isGet = function() { return this.method=='get'; }

/**
 * Détermine si la requête est de type Post
 * @return {Boolean} vrai si c'est le cas.
 */
Context.prototype.isPost = function() { return this.method=='post' }

/**
 * Provoque une redirection.
 *
 * @param {Action|String} action l'action sur laquelle on redirige, ou une url directement
 * @param {Object} args Les arguments à appliquer. (ignoré si action est une url)
 * @param {Integer=} [code=302] Le code de redirection à utiliser (301 pour une redirection permanente)
 * @throws {Error} Une erreur pour être catché par lassi tout de suite
 */
Context.prototype.redirect = function (path, code) {
  this.location = path;
  this.status = code || 302;
  this.next();
}

/**
 * Provoque la génération d'un access denied (403)
 * @param {string} message Le message éventuel (sera "access denied" si non fourni)
 */
Context.prototype.accessDenied = function(message) {
  this.status = 403;
  this.message = message || "access denied";
  this.next();
}

/**
 * Provoque la génération d'un not found (404)
 *
 * @param {string} message Le message éventuel (sera "not found" si non fourni)
 * @throws {Error} Une erreur de type 404.
 */
Context.prototype.notFound = function(message) {
  this.status = 404;
  this.message = message || "not found";
  this.next();
}

module.exports = Context;
