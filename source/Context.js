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

var _            = require('lodash');

/**
 * Contexte d'exécution d'une action.
 * @param {Request} request la requête Express
 * @param {Response} response la réponse Express
 * @fires Lassi#context
 * @constructor
 */
class Context {
  constructor(request, response) {
    /**
     * La requête Express
     * @see http://expressjs.com/api.html#request
     */
    this.request      = request;
    /**
     * La réponse Express
     * @see http://expressjs.com/api.html#response
     */
    this.response     = response;
    /** La méthode http utilisée (en minuscules) */
    this.method       = request.method.toLowerCase();
    /**
     * Les paramètres passés en get, alias vers request.query
     * @see http://expressjs.com/api.html#req.query
     */
    this.get          = this.request.query;
    /**
     * Les paramètres passés en post, alias vers request.body
     * http://expressjs.com/api.html#req.body
     */
    this.post         = this.request.body;

    /** La session */
    this.session      = this.request.session;
    /** Le user courant */
    this.user         = this.request.user;
    /**
     * Évènement généré de la création d'un nouveau contexte.
     * @param {Context} context le context fraîchement créé.
     * @event Lassi#context
     */
    lassi.emit('context', this);
  }

  /**
   * Détermine si la requête comporte des arguments Get
   * @return {Boolean} vrai si c'est le cas.
   */
	hasGet () { return !_.isEmpty(this.get) }

  /**
   * Détermine si la requête comporte des arguments Post
   * @return {Boolean} vrai si c'est le cas.
   */
	hasPost() { return !_.isEmpty(this.post) }

  /**
   * Détermine si la requête est de type Get
   * @return {Boolean} vrai si c'est le cas.
   */
	isGet() { return this.method=='get'; }

  /**
   * Détermine si la requête est de type Post
   * @return {Boolean} vrai si c'est le cas.
   */
	isPost() { return this.method=='post' }

  /**
   * Provoque une redirection.
   *
   * @param {String} path Le chemin de la redirection
   * @param {Integer=} [code=302] Le code de redirection à utiliser (301 pour une redirection permanente)
   */
	redirect (path, code) {
    this.location = path;
    this.status = code || 302;
    this.next();
  }

  /**
   * Provoque la génération d'un access denied (403)
   * @param {string=} message Le message éventuel (sera "access denied" si non fourni)
   */
	accessDenied(message) {
    this.status = 403;
    this.plain(message || "access denied");
  }

  /**
   * Provoque la génération d'un not found (404)
   *
   * @param {string=} message Le message éventuel (sera "not found" si non fourni)
   */
	notFound(message) {
    this.status = 404;
    this.plain(message || "not found");
  }

  /**
   * Renvoie une réponse de type JSON.
   * @param {object} data Les données (attention à renvoyer une liste de propriétés,
   *                      un array est transformé en objet, un string devient la propriété content
   *                      et les autres types primitifs sont ignorés)
   */
	json(data) {
    this.contentType = 'application/json';
    this.next(null, data);
  }

  /**
   * Renvoie une réponse de type jsonP (du code js)
   * Appelle la fonction précisée dans context.$callbackName, ou passée en get avec ?callback=...
   * ou à défaut "callback"
   * @param {object} data Les données à passer en paramètre à la fct de callback,
   *                      attention à ne pas envoyer de références circulaires
   */
	jsonP(data) {
    this.contentType = 'application/javascript';
    // on formate le code js
    var callbackName = this.$callbackName || this.get.callback || 'callback'
    var jsString = callbackName +'('
    // stringify peut planter en cas de références circulaire (faudra cloner avant)
    try {
      jsString += JSON.stringify(data)
    } catch (error) {
      jsString += '{ "error" : "' +error.toString().replace('"', '\\"') +'"}'
    }
    jsString += ');'
    this.next(null, jsString);
  }

  /**
   * Renvoie une réponse de type HTML.
   * @param {object} data données
   */
	html(data) {
    this.contentType = 'text/html';
    this.next(null, data);
  }

  /**
   * Renvoie une réponse en text/plain
   * @param {string} text
   */
	plain(text) {
    this.contentType = 'text/plain';
    this.next(null, {content: text});
  }

  /**
   * Renvoie une réponse raw
   * @param {string} text
   */
	raw(content, options) {
    if (options.attachment) this.response.attachment(options.attachment);
    if (options.headers) {
      for (var prop in options.headers) {
        this.response.append(prop, options.headers[prop]);
        if (prop === 'Content-Type') this.contentType = options.headers[prop];
      }
    }
    // on force le transport
    this.transport = 'raw';
    this.next(null, {content: content});
  }

  /**
   * Renvoie en json un message d'erreur attaché à un champ
   * L'objet envoyé sera de la forme {field: 'le nom du champ passé (ou absent)', message: 'le message', success: false}
   * @param {string|null} field le nom du champ en erreur
   * @param message Le message d'erreur
   */
	fieldError(field, message) {
    var data = {};
    if (field) data.field = field;
    data.message = message;
    data.success = false;
    this.json(data);
  }

  /**
   * Envoi data (cloné) en json en ajoutant une propriété success mise à true
   * @param data Les données à envoyer en json
   */
	rest(data) {
    data = _.clone(data);
    data.success = true;
    this.json(data);
  }

  /**
   * envoie data en json, avec toujours succes:false et message (ajouté si non fourni)
   * Si data est une Error, ça l'écrira en console.error (en ne passant que le message en json, sans la stack)
   * Pour éviter ce console.error, il suffit donc d'appeler cette fonction avec error.message plutôt que error
   * @param {String|Error|Object} data
   */
  restKO (data) {
    let response
    if (typeof data === 'string') {
      response = {
        message: data
      }
    } else if (data instanceof Error) {
      console.error(data)
      response = {
        message: data.message
      }
    } else if (typeof data === 'object') {
      response = _.clone(data)
      if (!response.message) response.message = 'erreur inconnue'
    } else {
      console.error(new Error('restKO appelé avec un argument invalide'), data)
      response = {
        message: 'erreur inconnue'
      }
    }
    response.success = false
    this.json(response)
  }

  /**
   * Ajoute un header à la réponse
   * @param name
   * @param value
   */
	setHeader(name, value) {
    this.response.setHeader(name, value);
  }

  /**
   * Retourne un header de la requete
   * @param {string} name Le header que l'on cherche
   * @param {string} [defaultValue=undefined] Valeur à retourner si le header name n'existe pas
   * @returns {string|undefined}
   */
	header(name, defaultValue) {
    if (_.has(this.request.headers, name)) {
      return this.request.headers[name];
    } else {
      return defaultValue;
    }
  }

}


module.exports = Context;
