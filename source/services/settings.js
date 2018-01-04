'use strict'
const _ = require('lodash')
const should = require('../tools/Asserts')

let isInitialized = false
/**
 * Service de gestion des réglages de lassi
 * @service $settings
 */
module.exports = function () {
  // Init $settings avec des valeurs par défaut dès la 1re résolution de $settings
  if (isInitialized) {
    console.error(new Error('$settings already initialized'))
  } else {
    should.object(lassi.settings, 'La configuration doit être un objet')
    should.object(lassi.settings.application, "Le champ 'application' n'est pas présent dans la configuration")
    should.string(lassi.settings.application.name, "Le réglage 'application.name' doit être défini")
    should.string(lassi.settings.application.mail, "Le réglage 'application.mail' doit être défini")

    // Paramétrage des slots de config par défaut
    _.defaults(lassi.settings, {
      rail: {},
      server: {},
      services: {}
    })

    // Paramétrage des options serveur par défaut
    _.defaults(lassi.settings.server, { port: 3000 })
    isInitialized = true
  }

  return {
    /**
     * Chargement des réglages à partir de la racine.
     * @param {string} path  Le chemin du réglage (ex. application.mail)
     * @param {*}      [def] La valeur à renvoyer si le chemin n'existe pas.
     * @return {*} la valeur du réglage
     * @memberof $settings
     */
    get: function get (path, def) {
      if (_.isString(path)) path = path.split(/\./)
      let current = lassi.settings
      while (path.length) {
        const part = path.shift()
        if (current.hasOwnProperty(part)) {
          current = current[part]
        } else {
          current = def
          break
        }
      }
      return current
    }
  }
}
