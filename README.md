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
monComposant.service('NomAutreService', function(NomService) { ... })
```

On peut aussi rajouter une entité à un composant. Une entité est un cas particulier de
service :

```javascript
monComposant.entity('NomEntité', function() {
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
monComposant.service('NomAutreService', function(NomService, NomEntité) { ... })
```

Pour paramétrer un composant, on peut lui adjoindre un configurateur

```javascript
monComposant.config(function() { /* code exécuté à l'init du composant */ })
```

On peut ensuite rajouter des controllers qui peuvent avoir des dépendances

```javascript
monApplication.controller('chemin/du/controleur', function(MonService, MonEntité) {

  // une première action pour la route chemin/du/controleur/cheminAction/*/* en get
  this.get('cheminAction/:foo/:bar', function(context) {
    // le code de cette action, on peut récupérer les paramètres de la route passée en 1er argument
    var myFoo = context.arguments.foo;
    var myBar = context.arguments.bar;
    // pour utiliser un transport (en fait rendu) défini ailleurs
    context.next(null, {hello: 'world', foo:myFoo, bar:myBar});
    // pour imposer ici un rendu html (à la place de la ligne précédente)
    context.html({
      $views: __dirname+'/views', // dossier des vues
      $metas : {
        title : 'Mon titre de page',
        css   : ['styles/main.css'], // des css à ajouter en <head>
        js    : ['vendors/jquery.min.js'], // des js à ajouter en <head>
      },
      $layout : 'layout-page', // le layout à utiliser (dans le dossier views)
      layoutBloc1 : {
        $view : 'foo', // le nom de la vue dans $views, à laquelle on passera les variables qui suivent
        bar : 'une valeur'
        // le rendu de cette vue sera envoyé au layout dans la variable layoutBloc1
      },
      baz : 'autre valeur' // variable baz passée directement au layout
    })
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
