/**
 * Service de gestion des entités. Voir les méthodes de l'objet {@link Entities}
 * @namespace $entities
 */
module.exports = function($settings) {
  var Entities = require('../entities');
  var entities = new Entities($settings.get('$entities'));

  /**
   * Initialisation du service utilisé par lassi lors
   * de la configuration du composant parent.
   *
   * @param callback next callback de retour
   * @memberof $entities
   * @private
   */
  entities.setup = function(cb) {
    entities.initialize(cb);
  }
  return entities;
}

