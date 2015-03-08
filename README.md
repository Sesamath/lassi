Initialisation
==============

L'initialisation du framework passe par l'appel à la fonction renvoyée par require
que l'on argument avec le dossier racine du projet (celui dans lequel se trouve le
donnes `config`)

```javascript
require('lassi')(__dirname+'/..);
```

L'étape suivante consiste en la création du composant principal
```javascript
var monApplication = lassi.component('MonAppli');
```

On peu ensuite rattacher des services au composant :
```javascript
monApplication.service('NomService', function() { ... })
```

Le service sont globaux. Une fois enregistrés, ils sont accessibles de tous les
composants. Attention donc aux conflits de nommage. 

Une fois un service enregistré, il peut être injecté par exemple dans un autre service en
passant son nom en paramètre
```javascript
monApplication.service('NomAutreService', function(NomService) { ... })
```

On peut aussi rajouter une entité à un composant. Une entité est un cas particulier du
service :
```javascript
monApplication.entity('NomEntité', function() { 
  this.construct(function() {
    this.champ = 'default value';
  })
  this.beforeLoad(function(cb) {
    this.champ = ;
    cb();
  })
  this.afterLoad(function(cb) {
    this.champ = ;
    cb();
  })
  this.afterStore(function(cb) {
    this.champ = ;
    cb();
  })
  this.defineIndex('champ', 'integer', function() { });
})
```

Elle peut donc aussi être injectée :
```javascript
monApplication.service('NomAutreService', function(NomService, NomEntité) { ... })
```

Pour paramétrer un composant, on peut lui adjoindre un configurateur
```javascript
monApplication.config(function() { ... })
```

On peut ensuite rajoute des controllers qui peuvent prendre des dépendances
```javascript
monApplication.controller(function(MonService, MonEntité) {
  this.get(function(context) {
    context.next(null, {hello: 'wordl'});
  });
})
```

Le contrôleur peut prendre un premier paramètre un chemin racine, auquel cas ce chemin
sera utilisé pour les actions qu'il contient. De même l'action peut avoir un chemin en
première paramètre auquel cas il sera ajouté au chemin du contrôleur. 

Dans le contrôleur, les fonctions appelées path this.XXX correspondent aux méthodes HTTP
(get,put,delete,post,options,etc.). Un cas spécial est `serve` qui permet de répondre par
la publication d'un dossier complet. 
```javascript
monApplication.controller('une/racine', function() {
  this.serve('un/sous/dossier', __dirname+'/public');
})
```

Puis de démarrer l'application
```javascript
monApplication.boot();
```

  
