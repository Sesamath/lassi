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

