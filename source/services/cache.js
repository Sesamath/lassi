'use strict'
/**
 * Service de gestion des entités. Voir les méthodes de l'objet {@link CacheManager}
 * @namespace $cache
 */
module.exports = function() {
  var Manager = require('../cache');
  var manager = new Manager();
  return {
    get       : function() { manager.get.apply(manager, arguments); },
    set       : function() { manager.set.apply(manager, arguments); },
    delete    : function() { manager.delete.apply(manager, arguments); },
    addEngine : function() { manager.addEngine.apply(manager, arguments); }
  }
}
