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
var querystring = require('querystring');

lassi.Class('lfw.framework.Context', {
  /**
   * Contexte d'exécution d'une action.
   * @param {Action} action L'action
   * @param {Request} request la requête Express.
   * @param {Response} response la réponse Express.
   * @param {Object} params Les paramétres de l'action
   * @constructor
   */
  construct: function (action, request, response, params) {
    /**
     * la requête Express
     * @type {Request}
     */
    this.request      = request;
    /**
     * la réponse Express
     * @type {Response}
     */
    this.response     = response;
    /**
     * Méthode http (en minuscules)
     * @type {string}
     */
    this.method       = request.method.toLowerCase();
    /**
     * Les arguments passés en get
     * @type {Object}
     */
    this.get          = this.request.query;
    /**
     * Les arguments passés en post
     * @type {Object}
     */
    this.post         = this.request.body;
    /**
     * La session (module express-session)
     * @type {Object}
     */
    this.session      = this.request.session;
    /**
     * Le user courant
     * @type {Object}
     */
    this.user         = this.request.user;
    /**
     * L'action courante
     * @type {Action}
     */
    this.action       = action
    /**
     * Les arguments passés à l'action
     * @type {Object}
     */
    this.arguments    = params
    /**
     * Le contrôleur courant
     * @type {Controller}
     */
    this.controller   = action.controller;
    /**
     * Le composant courant
     * @type {Component}
     */
    this.component    = action.controller.component;
    /**
     * L'application complète
     * @type {Application}
     */
    this.application  = action.controller.component.application;
  },

  /**
   * Détermine si la requête comporte des arguments Get
   * @return {Boolean} vrai si c'est le cas.
   */
  hasGet: function () { return !_.isEmpty(this.get) },



  /**
   * Détermine si la requête comporte des arguments Post
   * @return {Boolean} vrai si c'est le cas.
   */
  hasPost: function() { return !_.isEmpty(this.post) },

  /**
   * Détermine si la requête est de type Get
   * @return {Boolean} vrai si c'est le cas.
   */
  isGet: function() { return this.method=='get'; },

  /**
   * Détermine si la requête est de type Post
   * @return {Boolean} vrai si c'est le cas.
   */
  isPost: function() { return this.method=='post' },

  /**
   * Détermine si la requête dispose d'arguments liés à une action.
   * @return {Boolean} vrai si c'est le cas.
   */
  hasArguments: function() { return !_.isEmpty(this.arguments) },

  /**
   * Vérifie si la session est authentifiée et redirige le cas échéant.
   *
   * @param {Action} fallbackAction L'action sur laquelle rediriger si ce n'est
   * pas le cas. Si aucune action n'est spécifié on génère un
   * {@link Context#accessDenied|accessDenied}
   * @return {Boolean} vrai si c'est le cas.
   */
  ensureAccess: function(fallbackAction) {
    if (!this.isAuthenticated()) {
      if (fallbackAction) {
        this.redirect(fallbackAction);
      } else {
        this.accessDenied();
      }
    }
  },

  /**
   * Détermine si la requête est authentifiée.
   *
   * @return {Boolean} vrai si c'est le cas.
   */
  isAuthenticated: function() {
    return this.request.isAuthenticated && this.request.isAuthenticated();
  },

  /**
   * Fabrique l'url d'une action.
   *
   * @param {Action=} action l'action sur laquelle on redirige. Si non spécifié, ce sera l'action en cours.
   * @param {Object} args Les arguments à appliquer.
   * @param {Options} options Les arguments à appliquer. Pour l'instant la seule
   * option est query qui permet de donner un objet associatif à placer en
   * queryString.
   */
  url: function(action, args, options) {
    if (action && (typeof action.instanceOf  === 'undefined')) {
      options = args;
      args = action;
      action = undefined;
    }

    action = action || this.action;
    options = options || {};
    args = args || {};
    //lassi.assert.instanceOf(action, 'Action');

    var url = action.path;
    if (args) {
      for(var key in args) {
        url = url.replace(':'+key, args[key]);
      }
    }
    url = url.replace(/\?/g, '');

    if (options.query) {
      var tmp = _.clone(this.request.query);
      _.extend(tmp, options.query);
      _.each(tmp, function(v,k) {
        if (v==='') delete tmp[k];
      })
      if (!_.isEmpty(tmp)) {
        url += '?'+querystring.stringify(tmp);
      }
    }
    if (options.absolute) {
      url = this.request.protocol + '://' + this.request.get('host') + url;
    }
    return url;
  },

  /**
   * Fabrique lien d'une action.
   *
   * @param {Action} action l'action sur laquelle on redirige
   * @param {String} text Le texte du lien
   * @param {Object} args Les arguments à appliquer.
   * @param {Options} options Les arguments à appliquer. Pour l'instant la seule
   * option est query qui permet de donner un objet associatif à placer en
   * queryString.
   */
  link: function(action, text, args, options) {
    if (action && (typeof action.instanceOf  === 'undefined')) {
      options = args;
      args = text;
      text = action;
      action = undefined;
    }
    action = action || this.action;
    options = options || {};
    args = args || {};
    lassi.assert.not.empty(text);
    var url = this.url(action, args, options);
    return '<a href="'+url+'">'+text+'</a>';
  },


  /**
   * Génère un objet Pager.
   * @param {Object=} settings Les réglages du pager
   *  - `current` La position courante du page. Par défault c'est 1.
   *  - `windowSize` Le nombre de pages affichés. Par défaut c'est 10.
   *  - `mainClass` La classe à donner au pager. Par défaut c'est 'pagination'.
   *  - `nextClass` La classe à donner au next. Par défaut c'est 'next'.
   *  - `previousClass` La classe à donner au previous. Par défaut c'est 'previous'.
   *  - `currentClass` La classe de l'élément actif. Par défaut c'est 'active'.
   *  - `nextText` La chaîne à utiliser pour le bouton next. Par défaut c'est un chevron.
   *  - `previousText` La chaîne à utiliser pour le bouton previous. Par défaut c'est un chevron.
   * @return {Pager} Le pager
   */
  Pager: function(settings) {
    return new new lfw.widgets.Pager(this, settings);
  },

  /**
   * Authentifie la session en cours. Cette fonction est un raccourcis vers
   * la fonction équivalente de passeport.
   */
  authenticate: function() {
    return this.application.authentication.authenticate.apply(this.application.authentication, arguments);
  },

  /**
   * Authentifie la session avec un utilisateur.
   * @param {object} user L'utilisateur.
   * @param {SimpleCallback} callback la réponse.
   */
  login: function(user, callback) {
    this.request.logIn(user, callback);
  },

  /**
   * Annule l'authentification de la session.
   */
  logout: function() {
    return this.request.logout();
  },

  /**
   * Provoque une redirection.
   *
   * @param {Action|String} action l'action sur laquelle on redirige, ou une url directement
   * @param {Object} args Les arguments à appliquer. (ignoré si action est une url)
   * @param {Integer=} [code=302] Le code de redirection à utiliser (301 pour une redirection permanente)
   * @throws {Error} Une erreur pour être catché par lassi tout de suite
   */
  redirect: function (action, args, code) {
    // On place location en premier car si ça plante dans url(), on
    // ne veut pas que status soit réglé.
    if (typeof action === 'string') this.location = action
    else this.location = this.url(action, args);
    this.status = code || 302;
    this._next(new Error());
  },

  /**
   * Provoque l'arrêt des traitements.
   */
  break: function () {
    this.status = 666;
    this._next(new Error());
  },

  /**
   * Provoque la génération d'un access denied (403)
   * @param {string} message Le message éventuel (sera "access denied" si non fourni)
   */
  accessDenied: function(message) {
    this.status = 403;
    this.message = message || "access denied";
    this._next();
  },

  /**
   * Provoque la génération d'un not found (404)
   *
   * @param {string} message Le message éventuel (sera "not found" si non fourni)
   * @throws {Error} Une erreur de type 404.
   */
  notFound: function(message) {
    this.status = 404;
    this.message = message || "not found";
    this._next();
  },

  /**
   * Est-ce que l'on est dans le traitement d'une action donnée.
   *
   * @param {Action} action l'action
   * @return {Boolean} Vrai si on est bien sur cette action.
   */
  isAction: function(action) {
    return this.action==action;
  }
});

