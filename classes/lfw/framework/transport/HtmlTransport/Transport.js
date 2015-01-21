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
var flow = require('seq');
var util = require('util');

lassi.Class('lfw.framework.transport.HtmlTransport.Transport', {
  mixins: [lassi.Emitter],

  /**
   * Gestion du transport HTML.
   * @param {Application} application L'application parente
   * @extends EventEmitter
   */
  construct: function(application) {
    this.prout = 12;
    this.application = application;
    //this.layouts = {};
    this.engine = new lfw.framework.transport.HtmlTransport.DustRenderer();
    this.decorators = [];
    var _this = this;
    for (var componentName in application.components) {
      var component = application.components[componentName];
      component.decorators.forEach(function(decorator) {
        _this.decorators.push(decorator);
      });
    }
    _this.decorators.sort(function(a,b) { return a.weight-b.weight});
  },

 /**
  * Définit le layout à appliquer lorsque décorateurs et action sont
  * exécutés.
  *
  * @param {String} layout Le nom du layout
  * @param {Component} component Le composant qui est chargé du rendu du layout
  * @param {String} view La vue à utiliser pour le rendu
  */

 /**
  * Helper de rendu d'une vue via un composant.
  *
  * @param {Component} component le composant
  * @param {String} view la vue
  * @param {Object} data le context de rendu
  * @param {SimpleCallback} next la callback de retour
  * @private
  */
  renderView: function(component, view, data, next) {
    this.engine.render(lassi.fs.resolve(component.path, 'views'), view, data, next);
  },

/**
 * Execute le processing de la couche de transport.
 * @param {Context} context Le contexte de l'action.
 * @param {SimpleCallback} next la callback de retour
 * @private
 */
  processActionnables: function(context, next) {
    var _this = this;

    // Processing des décorateurs
    flow()
    .seq(function() {
      _this.processActionnable(context, context.action, this);
    })
    .set(_this.decorators)
    .parEach(function(decorator) {
      _this.processActionnable(context, decorator, this);
    })
    .empty()
    .seq(function() {
      if (context.status && (context.status >=400 || context.status<500)) {
        context.data.message = context.message;
      }
      next();
    })
    .catch(next);
  },

 /**
  * Helper de la fonction process.
  *
  * @param {Context} context Le contexte de l'action.
  * @param {Action} action l'action
  * @param {SimpleCallback} next la callback de retour
  * @private
  */
  processActionnable: function(context, action, next) {
    var _this = this;
    context._next = next;

    if (!context.metas) {
      context.metas = new lfw.framework.transport.HtmlTransport.Metas();
    }

    if (!context.data) context.data = {};

    action.execute(context, function(error, data) {
      if (error) return next(error);
      if (!data || _.isEmpty(data)) return next(error);
      if (!action.target) {
        _.extend(context.data, data);
      } else {
        if (!context.data[action.target]) context.data[action.target] = [];
        if (!action.view) {
          context.data[action.target].push(data);
          return next();
        }
        _this.renderView(action.component, action.view, data, function(error, result) {
          if (error) return next(error);
          context.data[action.target].push(result);
          next();
        })
      }
    });
  },

/**
 * Effectue le rendu de l'action.
 * @param {Context} context Contexte de l'action
 * @param {SimpleCallback} next la callback de retour
 * @fires HtmlTransport#metas
 * @private
 */
  render: function(context, next) {
    var layoutCallback;
    var _this = this;
    /**
     * Callback de renvoi d'un layout.
     * @callback HtmlTransport~LayoutCallback
     * @param {Component} component Le composant chargé du rendu
     * @param {String} view La vue à utiliser
     */

    /**
     * Évènement permettant de déterminer la vue à utiliser pour le layout désiré.
     * @event HtmlTransport#layout
     * @param {HtmlTransport~LayoutCallback} useLayout La fonction à utiliser pour fournir un layout.
     *
     * Un exemple valant mieux qu'un long discours :
     *
     * ```javascript
     *    component.initialize = function(next) {
     *      this.application.transports.html.on('layout', function(context, useLayout) {
     *        if (useLayout.name=='zarb' || useLayout.isAction(lassi.action.monActionZarb)) {
     *          useLayout(component, 'layout-zarb');
     *        } else {
     *          useLayout(component, 'layout-page');
     *        }
     *      });
     *      next();
     *    }
     * ```
     */

    // Parfois JS me fait rigoler :) En gros je défini une fonction qui va
    // fabriquer une fonction, utilisant les arguments de ma première fonction
    // comme contexte d'exécution, tout en utilisant le _this de la fonction d'où
    // je parle là. Et comme une fonction est un objet, le lui ajoute des
    // propriétés utiles pour le listener. Et pour finir, je passe le tout en
    // paramètre d'un évènement.... Et le pire, c'est que ça marche super !!
    var useLayout = function(component, view) {
      layoutCallback = function(data, callback) {
        _this.renderView(component, view, data, callback);
      }
    }
    useLayout.name = context.transportSettings.layout
    useLayout.context = context;
    this.emit('layout', useLayout);
    if (!layoutCallback) return next(new Error('Personne ne veut me filer un layout, je suis bien triste !'));

    /**
     * Évènement permettant de modifier les métas avant émission.
     * @event HtmlTransport#metas
     * @param {Object} metas L'objet métas à altérer
     */
    this.emit('metas', context.metas);
    context.metas.siteName = context.metas.siteName || this.application.name;
    context.data.bodyClasses = [context.action.name].join(' ');
    context.data.head = context.metas.head().render();
    context.data.breadcrumbs = context.metas.breadcrumbs;
    context.data.pageTitle = context.metas.pageTitle;
    layoutCallback(context.data, function(error, result) {
      next(error, result);
    });
  },

  process: function(context, next) {
    var _this = this;
    this.processActionnables(context, function(error) {
      if (error) return next(error);
      _this.render(context, function(error, result) {
        if (error) next(error);
        if (context.status) context.response.status(context.status);
        context.response.send(result);
        next();
      });
    });
  },

 /**
  * Prend en charge une erreur survenue au cours du traitement de l'action.
  * @param {Context} context Le contexte de l'action.
  * @param {Object} error Un objet décrivant le contexte de l'erreur.
  */
  manageError: function(context, error) {
    var output;

    if (this.application.staging == lassi.Staging.development) {
      if (error.error)
        error.error = "<pre>" + util.inspect(error.error) + "</pre>";
      error.message = "<span style='color: #750000'><b>" + error.message + "</b></span>";
      if (error.stack)
        for (var i in error.stack) {
          error.stack[i] =
            '<tr>' +
            '<td align="right" class="module"><pre>' +
            // function n'existe pas toujours (TypeError: Cannot call method 'replace' of undefined)
            (error.stack[i].function ? error.stack[i].function.replace('<', '&lt;').replace('>', '&gt;') : '') +
            '</pre></td>' +
            '<td class="file">' + error.stack[i].file + '</td>' +
            '<td class="line">' + error.stack[i].line + '</td>' +
            '</tr>';
        }
        error.stack = "<table class='stack'>" + error.stack.join('') + "</table>";

        output = '<style>';
        output += '.line { color: #799B23; font-weight:bold }';
        output += '.module { color: #799B23; font-weight:bold }';
        output += 'table.error>tbody>tr>td>pre { padding: 5px;}';
        output += 'table { border-collapse: collapse}';
        output += 'table.error>tbody>tr>td { border: 1px solid #E0E0E0; padding: 2px 10px}';
        output += 'table.stack>tbody>tr>td { border-bottom: 1px dashed #E0E0E0; padding: 2px 10px}';
        output += '</style>';
        output += '<table class="error">';
        _.each(error, function (value, key) {
          output += '<tr><td align="right" valign="top"><b>' + key + '</b></td><td>' + value + '</td></tr>';
        })
        output += '</table>';
    } else {
      output = "Something went wrong, please contact <a href='mailto://"+this.application.mail+"'>the administrator</a>.";
    }
    context.response.send(500, output);
    return true;
  }
});
