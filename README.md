Structure d'une application lassi
=================================
    build/
    config/
      index.js
    construct/
      index.js
      monComposant/
        index.js
        controllers/
          monControleur.js
        decorators/
          monDécorateur.js
        entities/
          monEntité.js
        views/
          partials/
            monFragment.dust
          maVue.dust
    node_modules/
    gulpfile.js
    package.json

  - `build` va recevoir le résultat de la compilation du projet contenu dans le
  dossier `construct`. 
  - `construct` contient le code brut du projet. Il contient à minima un fichier
    `index.js` chargé de l'initialisation du projet. 
  
Initialisation d'une application
================================
L'objet global [lassi](lassi.html) donne accès aux fonctions et objets du framework Lassi.
Il suffit donc de le déclarer une seule fois, généralement dans le fichier index.js du
module applicatif pour avoir accès au namespace dans le reste du code.

```javascript
require('lassi');
```

L'étape suivante consiste en la création de l'application lassi qui héberge l'ensemble
de la logique du framework. 

```javascript
var monApplication = lassi.Application();
```

Une fois l'application crée, il est possible d'y rattacher l'écoute d'évènements
```javascript
monApplication.on('initialize', function(next) { ... }
```
ou tout simplement démarrer l'application
```javascript
monApplication.boot();
```
Une fois démarrée, l'application va :
 - déterminer sa racine en se basant sur le chemin de votre `index.js`
 - rechercher les composants

Pour chaque composant Lassi va charger les contrôleurs, les décorateurs et les entités.
Ensuite l'application initialisera chacun des composants et se mettra enfin en écoute du
port 3000 (par défaut). 

Ajout d'un composant
====================
Un composant est une unité logique dont le but est de regrouper un aspect fonctionnel de
l'application. Par exemple un blog pourrait avoir un composant `article` et un composant
`commentaire`. 

La création d'un composant consiste simplement à créer son dossier au niveau du fichier
`index.js`. Il est possible, mais pas obligatoire, de mettre dans ce dossier un fichier
d'initialisation du composant. 

```javascript
var component = lassi.Component();
component.initialize = function(next) {
  next();
}

module.exports = component;
```

La fonction `initialize` est optionnelle. Elle est appelée lors de l'initialisation du
composant et sera probablement remplacée à terme par un emit/on.

Callbacks
=========
Dans lassi les callbacks sont utilisées un peu partout (logique). Elles sont de deux
types, les synchrones (ex. {@link Component.initialize}) ou les asynchrones (ex {@link Action.do}).

Les callbacks asynchrones ont des caractéristiques communes :
  - Elle sont exécutée en sein d'un context (ex. L'objet {@link Context} pour une callback
    {@link Action.do}). Cela veut dire que le `this` correspond au contexte. 
  - Elles peuvent être synchrones (sic ! ;-). Dans ce cas, il faut soit que la callback
    n'ait aucun paramétre, soit qu'elle renvoie un résultat non indéfini.  
  - Elles peuvent avoir un seul paramètre qui sera alors une callback de retour type
    nodejs (error, result)
  - Elles peuvent avoir deux paramètres, et le premier sera le contexte, le second la
    callback de retour. 
  - La callback de retour lorsqu'elle est spécifiée peut être utilisé à la mode nodeJs
    (ex. `next(null, {mon:'résultat'})`), soit de manière raccourcie en mettant résultat
    ou erreur en première paramètre. Il faut dans ce cas que l'erreur soit une instance de
    `Error`. 

Pour plus de précision, voir l'objet {@link Callbacks}
