'use strict'
const _ = require('lodash')

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
    if (!lassi.settings) throw new Error('La configuration doit être un objet')
    if (!lassi.settings.application) throw new Error('Le champ "application" n’est pas présent dans la configuration')
    if (!lassi.settings.application.name) throw new Error('Le réglage "application.name" doit être défini en configuration')
    if (!lassi.settings.application.mail) throw new Error('Le réglage "application.mail" doit être défini en configuration')

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
