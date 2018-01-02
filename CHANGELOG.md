Version 1.8.0
=============
  - Controller : Les fonctions get/put/etc retourne un le controller et non l'action
  - Controller : JSON est le format par défaut
  - Action : Controller('XXX').get(cb) => XXX comme chemin pour l'action
  - Controller : l'absence de chemin (undefined) => / (racine)
  - Application : Ajout du parsing BODY/JSON et d'un reviver d'objet Date

Version 1.8.1
=============
  - Suppression des CORS, à gérer par l'appli
  - Ajout d'une méthode "use" à l'application pour injecter ses propres middleware (voir
    l'usage de railUse pour plus d'info.

Version 2
=========
* 2.2.5 (2017-11-24)
  * Modif body-parser (on prend celui d'express, ajout d'un wrapper pour parser json ou urlencoded suivant contexte mais pas les deux)
  * ajout d'un railErrorHandler pour gérer une erreur d'un middleware
* 2.2.6 (2017-11-24)
  * ajout d'un accessLog si précisé en config
* 2.2.7 (2017-12-07)
  * ajout maxAge: 1h par défaut (pour serve uniquement)
* 2.2.8 (2017-12-29)
  * ajout updates non bloquants
* 2.2.9 (2017-12-29)
  * ajout countBy
* 2.2.10 (2018-01-02)
  * solidification countBy en imposant un index existant
  * méthodes internes sorties de la classe EntityQuery (alterLastMatch, createEntitiesFromRows, getType, hasIndex, prepareRecord)
  * les index non lassi d'une collection lassi sont tous virés à l'init de l'Entity
  * Ajout de Entities.close()
  * Entities.dropIndexes() supprimé (deprecated depuis longtepms)
  * Entities.initializeEntity() supprimé (doublon de EntityDefinition.initialize)
  * refacto des tests pour les rendre plus indépendants
  * ajout de $cache.quit() et refacto du test pour l'utiliser (et que mocha rende la main à la fin de ce test seul)
