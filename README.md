Initialisation
==============

L'initialisation du framework passe par l'appel de la fonction renvoyée par require
avec le dossier racine du projet en argument (celui dans lequel se trouve le
dossier `config`)

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
indiquant son nom en paramètre de la fonction de callback

```javascript
monApplication.service('NomAutreService', function(NomService) { ... })
```

On peut aussi rajouter une entité à un composant. Une entité est un cas particulier de
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
monComposant.config(function() { /* code exécuté à l'init du composant */ })
```

On peut ensuite rajoute des controllers qui peuvent avoir des dépendances

```javascript
monApplication.controller(function(MonService, MonEntité) {
  this.get(function(context) {
    context.next(null, {hello: 'world'});
  });
})
```

`controller()` peut prendre en premier paramètre un chemin racine d'url, auquel cas ce chemin
sera utilisé pour les actions qu'il contient. De même l'action peut avoir un chemin en
premier paramètre et il sera ajouté au chemin du contrôleur.

Dans le contrôleur, les fonctions appelées par this.XXX correspondent aux méthodes HTTP
(get,put,delete,post,options,etc.). Un cas spécial est `serve` qui permet de publier
un dossier complet.

```javascript
// va rendre accessible le fichier public/foo.bar via l'url /une/racine/un/sous/dossier/foo.bar
monApplication.controller('une/racine', function() {
  this.serve('un/sous/dossier', __dirname+'/public');
})
```

Et pour démarrer l'application on appelle bootstrap() sur le composant principal

```javascript
monApplication.bootstrap();
```
