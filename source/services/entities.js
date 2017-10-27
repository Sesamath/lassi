'use strict'
const Entities = require('../entities')
let entities
/**
 * Service de gestion des entités. Voir les méthodes de l'objet {@link Entities}
 * @service $entities
 */
module.exports = function ($settings) {
  if (entities) {
    console.error(new Error('$entities should be called only once'))
    return entities
  }
  entities = new Entities($settings.get('$entities'));

  /**
   * Initialisation du service utilisé par lassi lors
   * de la configuration du composant parent.
   *
   * @param callback next callback de retour
   * @memberof $entities
   * @private
   */
  entities.setup = entities.initialize

  return entities;
}
