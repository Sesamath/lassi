'use strict'
// on sort ça de la fonction exportée pour avoir un singleton (on veut pas deux cacheManager)
const Manager = require('../cache');
const manager = new Manager();
/**
 * Service de gestion du cache. Voir les méthodes de l'objet {@link CacheManager}
 * @namespace $cache
 */
module.exports = function() {
  return {
    get       : function() { manager.get.apply(manager, arguments); },
    set       : function() { manager.set.apply(manager, arguments); },
    delete    : function() { manager.delete.apply(manager, arguments); },
    addEngine : function() { manager.addEngine.apply(manager, arguments); }
  }
}
