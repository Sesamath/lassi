Version 1
=========
* 1.7.25 (2015-01-21)
  * init du repository github
  
Version 1.8
-----------
* 1.8.0
  - Controller : Les fonctions get/put/etc retourne un le controller et non l'action
  - Controller : JSON est le format par défaut
  - Action : Controller('XXX').get(cb) => XXX comme chemin pour l'action
  - Controller : l'absence de chemin (undefined) => / (racine)
  - Application : Ajout du parsing BODY/JSON et d'un reviver d'objet Date

* 1.8.1
  - Suppression des CORS dans lassi, à gérer par l'appli
  - Ajout d'une méthode "use" à l'application pour injecter ses propres middleware (voir l'usage de railUse pour plus d'info).
  
…

* 1.8.64 (2016-04-12)

Version 2
=========

Version 2.0 (dernière version avec mysql)
-----------------------------------------
* 2.0.0 (2016-08-26)
…
* 2.0.11 (2016-12-01)
  * fix mineurs (variables inutilisées)
* 2.0.12 (2016-12-15)
  * blindage avec cast sur chaque index
* 2.0.13 (2016-12-16)
  * aj d'options à grab pour permettre un distinct
* 2.0.14 (2017-01-13)
  * aj debug sur count
* 2.0.15 (2017-01-13)
  * ajout de tests unitaires sur entities
* 2.0.16 (2017-02-07)
  * ajout de $entities-cli
* 2.0.17 (2017-05-16)
  * modifs de log, améliorations cli
* 2.0.18 (2017-06-20)
  * modif des logs cli
  * amélioration du message d'erreur quand la vue n'existe pas

Version 2.1 (mongoDb)
---------------------
* 2.1.0 (2017-03-29)
  * Première version d'une branche mongo
* 2.1.1 (2017-03-29)
  * Fix dependencies
* 2.1.2 (2017-04-11)
  * Fix EntityQuery#notIn + allow multiple match on same attribute
* 2.1.3 (2017-04-13)
  * Add beforeDelete() trigger
  * fix isNull() et index sur date indéfinie
* 2.1.4 (2017-04-28)
  * Les timeout par défaut deviennent des constantes de lassi
* 2.1.5 (2017-08-02)
  * Ajout soft-delete
  * ajout d'un hardLimit à grab, et on accepte skip ou offset en options
  * Ajout du middleware maintenance
  * pass obligatoire si user mongo (sinon ni l'un ni l'autre)
* 2.1.6 (2017-08-02)
  * merge des modifs de la branche mysql (2.0) qui a évolué en // (2.0.14 à 2.0.18)
* 2.1.7 (2017-08-18)
  * on autorise match _id
  * amélioration des messages d'erreur
* 2.1.8 (2017-08-25)
  * full text search
  * aj d'une purge générique en cli
* 2.1.9 (2017-08-29)
  * ok remplacé par success sur les appels rest
* 2.1.10 (2017-08-31)
  * hardLimit monté à 5000, fix sur l'avertissement qui pouvait donner du faux positif
* 2.1.11 (2017-08-31)
  * ajout d'un log.error si on remonte hardLimit résultats
* 2.1.12 (2017-09-08)
  * fix softDelete in Entity#store()
  * ajout EntityQuery#includeDeleted() & Entity#isDeleted()
  * ajout EntityQuery#notEquals()
  * fix flush si la collection n'existe pas
* 2.1.13 (2017-09-12)
  * ajout de EntityQuery.purge()
  * aj de markToRestore, pour masquer la propriété __deletedAt aux applis
  * tests mongo réparés (ok aussi sur mongo 3.4)
* 2.1.14 (2017-09-13)
  * ajout de Context.restKo()
* 2.1.15 (2017-09-15)
  * suppression du warning si limit = hardLimit
  * fix sur la création d'index
  * ajout de l'initialize des entities (qui était tout simplement ignoré)
* 2.1.16 (2017-09-16)
  * blindage contre des datas invalides
  * aj de getCookie et setCookie
  * ajout d'un context.setNoCache, que l'on utilise sur les redirect (sauf les 301)
* 2.1.17 (2017-09-20)
  * On durcit avec un plantage au in|notIn ou avec greaterThan & co si la valeur passée est invalide (undefined ou tableau vide pour in par ex)
* 2.1.18 (2017-10-04)
  * upgrade express & body-parser
* 2.1.19 (2017-10-05)
  * ajout Entity.onLoad()
* 2.1.20 (2017-10-10)
  * ajout de $byPassDuplicate et élimination des $properties
* 2.1.21 (2017-10-10)
  * lassi plus souple sur query.in([]) (log une erreur mais plante plus)
* 2.1.22 (2017-10-12)
  * fix cast sur valeurs absentes
* 2.1.23 (2017-10-16)
  * refacto du store, avec divers fixes : cast est maintenant le même dans Entity et EntityDefinition, fix affectation conditionnelle de __deletedAt, fix removeTemporaryFields
* 2.1.24 (2017-10-30)
  * Ajout des auto-updates
  * export de HARD_LIMIT_GRAB
  
Version 2.2 (redis)
-------------------
* 2.2.0 (2017-11-02)
  * le cache utilise redis (et plus memcached)
* 2.2.1 (2017-11-03)
  * amélioration des tests redis
* 2.2.2 (2017-11-03)
  * modif des logs cli, modifs mineures
* 2.2.3 (2017-11-06)
  * fix $cache.del, code avec cb et promisify si pas de cb
* 2.2.4 (2017-11-20)
  * modifications mineures, nettoyage, commentaires…
* 2.2.5 (2017-11-24)
  * Modif body-parser (on prend celui d'express, ajout d'un wrapper pour parser json ou urlencoded suivant contexte mais pas les deux)
  * ajout d'un railErrorHandler pour gérer une erreur d'un middleware
* 2.2.6 (2017-11-24)
  * ajout d'un accessLog si précisé en config
* 2.2.7 (2017-12-07)
  * ajout maxAge: 1h par dégitfaut (pour serve uniquement)
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

