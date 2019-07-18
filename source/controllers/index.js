'use strict'

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
var _ = require('lodash')
var Context = require('../Context')
var EventEmitter = require('events').EventEmitter
var flow = require('an-flow')

function merge (a, b) {
  _.forEach(b, (v, k) => {
    if (_.isArray(a[k])) {
      a[k] = a[k].concat(v)
    } else if (typeof a[k] === 'object') {
      merge(a[k], v)
    } else {
      a[k] = v
    }
  })
}

/**
 * La classe controller est le chef d'orchestre de lassi. Elle gère
 * l'arrivée des requêtes, détermine les actions qui y répondent et
 * la couche de transport à utiliser pour répondre.
 * @constructor
 * @private
 * @extends Emitter
 */
class Controllers extends EventEmitter {
  /**
  * Génération du middleware Express.
  * @return {Function} Le middleware
  */
  middleware () {
    var self = this

    /**
     * Le middleware.
     * @fires Controllers#request
     */
    return function (request, response, next) {
      if (!self.actions) {
        // Première requête depuis le boot, on collectionne toutes les actions disponibles
        self.actions = []
        _.forEach(lassi.components, function (component) {
          _.forEach(component.controllers, function (controller) {
            _.forEach(controller.actions, function (action) {
              self.actions.push(action)
            })
          })
        })
      }

      // Génération du contexte
      var context = new Context(request, response)

      // Sélection des actions déclenchables
      var params
      const actionnables = []
      let hasBadParam
      const isBadParam = (param) => ['undefined', 'null'].includes(param)
      // on parse les actions pour affecter actionnables
      _.forEach(self.actions, function (action) {
        // on veut pas le search
        const pos = request.url.indexOf('?')
        // on a une url qui démarre toujours avec /, donc si y'a du search, pos sera au minimum à 1
        const pathname = (pos > 0) ? request.url.substr(0, pos) : request.url
        params = action.match(request.method, pathname)
        if (params) {
          actionnables.push({action: action, params: params})
          // si on rencontre un param foireux on arrête là, pas la peine d'ajouter les actionnables suivants
          if (_.some(params, isBadParam)) {
            hasBadParam = true
            return false
          }
        }
      })
      if (hasBadParam) {
        const error = new Error('Bad request')
        error.status = 400
        // on skip tous les contrôleurs et laisse le ramasse miette gérer suivant accept (en fin de rail.js)
        return next(error)
      }

      // Espace de stockage des résultats
      var data = {}

      // Séquencement des actions
      flow(actionnables)
        .seqEach(function (actionnable) {
          // Si une erreur s'est produite plus haut dans la chaîne, on n'exécute pas les actions suivantes.
          if (context.error) return this()
          // idem si un contrôleur veut court-cirtuiter les suivants (à priori c'est un contrôleur qui détecté un problème
          // et il devrait plutôt passer une erreur, mais on lui laisse cette possibilité)
          if (context.skipNext) return this()

          var nextAction = this
          context.arguments = actionnable.params
          // si un parametre vaut undefined ou null, on lance ici un Bad Request et shunt la suite

          // L'actionnable est un middleware
          if (actionnable.action.middleware) {
            actionnable.action.middleware(request, response, function () { nextAction() })

          // L'actionnable est une action
          } else {
            actionnable.action.execute(context, function (error, result) {
              if (error) {
                context.error = error
                return nextAction()
              }

              result = result || {}

              // Si le résultat et une simple chaîne, on la transforme en content et on affecte
              // un content type adapté
              if (typeof result === 'string') {
                context.contentType = context.contentType || 'text/plain'
                data.content = result
                data.$layout = false
              } else {
                // Cas général d'un retour objet à merger
                merge(data, result)
              }

              nextAction()
            })
          }
        })
        .seq(function () {
          // le contrôleur a le droit de se débrouiller avec context.response et demander l'abandon du processing
          if (context.transport === 'done') return
          // Une redirection passe en fast-track
          if (!context.error && context.location) return this()

          lassi.emit('beforeTransport', context, data)

          // contentType par défaut
          if (!context.contentType) context.contentType = 'text/plain'

          // Si une erreur s'est produite et que rien n'a été fait dans le beforeTransport
          // => envoie une erreur 500 standard
          if (context.error) {
            // sortie console
            const message = context.error.toString()
            console.error(message.red, context.error.stack.toString().replace(message, ''))
            // valeurs par défaut si celui qui a déclaré l'erreur ne les a pas affectées
            if (!context.status) context.status = 500
            if (!data.content) data.content = 'Server Error'

          // Ou bien si on n'a pas reçu de contenu => 404 en text/plain
          } else if (!context.status && _.isEmpty(data)) {
            context.status = 404
            data.content = 'not found ' + context.request.url
            context.contentType = 'text/plain'
          }

          // Sélection du transport et processing
          var transport
          if (context.transport && lassi.transports[context.transport]) transport = lassi.transports[context.transport]
          else if (!context.contentType) return this(new Error('No content type defined'))
          else transport = lassi.transports[context.contentType]
          if (!transport) return this(new Error('No renderer found for contentType:' + context.contentType))
          transport.process(data, this)
        })
        .seq(function (content) {
          if (context.status) {
            context.response.status(context.status)
            if (context.status > 300 && context.status < 400) {
              if (context.location) return context.response.redirect(context.location)
              else return this(new Error('Redirect code without location'))
            }
          }
          context.response.setHeader('Content-Type', context.contentType)
          context.response.send(content)
        })
        .catch(next)
    }
  }
}

module.exports = Controllers
