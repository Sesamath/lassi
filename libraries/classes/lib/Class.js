/*
 * @preserve This file is part of "arf-classes".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "arf-classes" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "arf-classes" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "arf-classes"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var BaseObject = require('./BaseObject');
var NameSpace = require('./NameSpace');

var keywords = {extend: true, members: true, statics: true, mixins: true, construct: true, type: true};
var initializing = false;

function Class(name, userDefinition) {
  var definition = {};
  if (typeof name !== 'string') {
    userDefinition = name;
    name = undefined;
  }

  // Traitement du champ 'classPath|className'
  if (name) {
    var i = name.lastIndexOf('.');
    if (i==-1) {
      definition.className = name;
      definition.classPath = undefined;
    } else {
      definition.className = name.substr(i+1);
      definition.classPath = name.substr(0, i);
    }
  } else {
    definition.classPath = undefined;
    definition.className = undefined;
  }

  // Traitement du champ 'members'
  definition.members = userDefinition.members || {};
  for (var memberName in userDefinition) {
    if (!keywords.hasOwnProperty(memberName)) {
      definition.members[memberName] = userDefinition[memberName];
    }
  }

  // Traitement du champ 'type'
  definition.type = userDefinition.type || 'class';

  // Traitement du champ 'statics'
  definition.statics = userDefinition.statics || {};

  // Traitement du champ 'mixins'
  definition.mixins = userDefinition.mixins || [];

  // Traitement du champ 'extend'
  if (userDefinition.extend) {
    if (typeof userDefinition.extend !== 'function') throw new Error('Classe parent introuvable : '+definition.className);
    definition.extend = userDefinition.extend;
  } else {
    definition.extend = BaseObject;
  }
  definition.extendPrototype = definition.extend.prototype;
  initializing = true;
  definition.prototype = new definition.extend();
  initializing = false;

  // Traitement du champ 'construct'
  if (userDefinition.construct) {
    definition.construct = userDefinition.construct;
  } else {
    definition.construct = function() {};
  }

  switch (definition.type) {
  case 'class':
    if (definition.extend != Object && isOverride(definition.construct)) {
      definition.prototype.construct = (function(definition) {
        return function() {
          for (var i in definition.mixins) {
            definition.mixins[i].prototype.construct.apply(this);
          }
          var tmp = this.parent;
          if (definition.extendPrototype.hasOwnProperty('__definition')) {
            this.parent = definition.extendPrototype.construct;
          } else {
            this.parent = definition.extend;
          }
          var result = definition.construct.apply(this, arguments);
          this.parent = tmp;
          return result;
        };
      })(definition);
    } else {
      if (definition.extend != BaseObject && definition.extendPrototype.construct.length!==0)
        throw new Error(definition.className+": Un appel implicite au constructeur parent ne peut se faire que si le constructeur parent n'a aucun argument");
      definition.prototype.construct = (function(d) {
        return function() {
          for (var i in d.mixins) {
            d.mixins[i].prototype.construct.apply(this);
          }
          if (d.extendPrototype.__definition) {
            d.extendPrototype.construct.apply(this);
          } else {
            d.extend.apply(this);
          }
          var result = d.construct.apply(this, arguments);
          return result;
        };
      })(definition);
    }
    break;

  case 'mixin':
    definition.prototype.construct = definition.construct;
    break;

  default:
    throw new Exception(definition.className+" : Type inconnu "+definition.type);
  }

  function AnonymousClass() {
    if ( !initializing && this.construct) {
      this.construct.apply(this, arguments);
    }
  }

  if (definition.className) {
    definition.class = eval('(function() { return '+AnonymousClass.toString().replace('AnonymousClass', definition.className)+'})()');
  } else {
    definition.class = AnonymousClass;
  }

  // Ajout des mixins
  for (var j in definition.mixins) {
    var mixin = definition.mixins[j];
    for (memberName in mixin.prototype) {
      if (!keywords.hasOwnProperty(memberName)) {
        definition.prototype[memberName] = mixin.prototype[memberName];
      }
    }
  }

  // Ajout des éléments statiques
  var member;
  for (var staticName in definition.extend) {
    if (typeof definition.extend[staticName] === 'function') {
      definition.class[staticName] = definition.extend[staticName];
    }
  }
  for (memberName in definition.statics) {
    member = definition.statics[memberName];
    definition.class[memberName] = member;
  }

  for (memberName in definition.members) {
    member = definition.members[memberName];
    if (isOverride(member)) {
      if (typeof definition.extendPrototype[memberName] !== "function" )
        throw new Error('Appel à parent sans surcharge pour la méthode '+definition.classPath+'::'+memberName);
      member = (function(memberName, member){
        return function() {
          var tmp = this.parent;
          this.parent = definition.extendPrototype[memberName];
          var result = member.apply(this, arguments);
          this.parent = tmp;
          return result;
        };
      })(memberName, member);
    }
    definition.prototype[memberName] = member;
  }

  // Finalisation de la classe
  definition.prototype.__definition = definition;
  definition.class.prototype = definition.prototype;
  definition.class.prototype.constructor = definition.class;

  if (definition.classPath) {
    register(definition.classPath+'.'+definition.className, definition.class);
  }

  return definition.class;
}


function register(path, object) {
  path = path.split('.');
  if (path.length==1) return;
  var isBrowser = typeof GLOBAL === 'undefined';
  var root = isBrowser?window:GLOBAL;
  var part;
  while (path.length) {
    part = path.shift();
    if (path.length) {
      if (!root.hasOwnProperty(part)) root[part] = new NameSpace(root, part);
      root = root[part];
    } else {
      if (isBrowser) {
        root[part] = object;
      } else {
        root.classes[part] = object;
      }
    }
  }
  return object;
}

function isOverride(f) {
  var parentCallChecker = /\bthis\b\.\bparent\b\s*\(/;
  return typeof f == "function" && parentCallChecker.test(f);
}


module.exports = Class;
Class.register = register;
