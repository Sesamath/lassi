"use strict";
/*
* This file is part of "Lassi".
*    Copyright 2009-2014, arNuméral
*    Author : Yoran Brault
*    eMail  : yoran.brault@arnumeral.fr
*    Site   : http://arnumeral.fr
*
* "Lassi" is free software; you can redistribute it and/or
* modify it under the terms of the GNU General Public License as
* published by the Free Software Foundation; either version 2.1 of
* the License, or (at your option) any later version.
*
* "Lassi" is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* General Public License for more details.
*
* You should have received a copy of the GNU General Public
* License along with "Lassi"; if not, write to the Free
* Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
* 02110-1301 USA, or see the FSF site: http://www.fsf.org.
*/

var pathlib = require('path');
var fs = require('fs');
var _ = require('lodash');

/**
 * Le moteur de rendu html, accessible via lassi.transports.html.engine
 * @param options
 * @constructor Renderer
 */
function Renderer(options) {
  this.cache = true
  this.cacheStore = {}
  this.keepWhiteSpace = false
  for(var key in options) this[key] = options[key];
  this.dust  = require('dustjs-helpers');
}

/**
 * Permet d'ajouter un helper dust
 * @see http://www.dustjs.com/guides/dust-helpers/
 * @param {string} name
 * @param {function} callback La callback (cf doc pour les arguments)
 */
Renderer.prototype.helper = function(name, callback) {
  var self = this;
  this.dust.helpers[name] = function() {
    callback.apply(self.dust, Array.prototype.slice.call(arguments));
  };
}

/**
 * Permet d'ajouter un filtre dust
 * @see http://www.dustjs.com/docs/filter-api/
 * @param {string} name le nom du filtre (à utiliser dans les templates avec |monFiltre)
 * @param {function} callback La callback qui reçoit la valeur et devra la retournée filtrée (contexte dust)
 */
Renderer.prototype.addFilter = function(name, callback) {
  var self = this;
  this.dust.filters[name] = function(value) {
    return callback.call(self.dust, value);
  };
}

/**
 * Récupère le chemin absolu du template et le passe à callback
 * @param viewsPath
 * @param unresolvedPath
 * @param locals
 * @param callback
 */
Renderer.prototype.resolveTemplate = function (viewsPath, unresolvedPath, locals, callback) {
  // Normalize
  var path = unresolvedPath;
  // ajout de l'extension si elle n'y est pas
  if (pathlib.extname(path)==='') path+='.dust';

  // on autorise les chemins absolus, sinon c'est relatif a viewsPath
  // @see https://nodejs.org/api/path.html#path_path_resolve_from_to
  if (path.charAt(0) !== '/') {
    if (!_.isString(viewsPath)) throw new Error('Wrong views path', viewsPath);
    path = pathlib.resolve(viewsPath, path);
  }

  // Check if path exists
  fs.lstat(path, function(err) {
    callback(err, path);
  });
}

/**
 * Lit un template et le passe à callback
 * @param viewsPath
 * @param unresolvedPath
 * @param locals
 * @param callback
 */
Renderer.prototype.readTemplate = function (viewsPath, unresolvedPath, locals, callback) {
  var self = this;
  if (self.cache && self.cacheStore[unresolvedPath]) {
    callback(null, self.cacheStore[unresolvedPath]);
  } else {
    self.resolveTemplate(viewsPath, unresolvedPath, locals, function(err, path) {
      if (err) { callback(err); return; }
      fs.readFile(path, 'utf8', function(err, res) {
        if (err) { callback(err); return; }
        if (self.cache) self.cacheStore[unresolvedPath] = res;
        callback(null, res);
      });
    });
  }
}

/**
 * Calcule le rendu et le passe à callback
 * @param viewsPath
 * @param unresolvedPath
 * @param locals
 * @param callback
 */
Renderer.prototype.render = function (viewsPath, unresolvedPath, locals, callback) {
  var self = this;
  var template = (this.cache && this.cacheStore[unresolvedPath]) || null;
  if (template) {
    template(locals, callback);
  } else {
    self.dust.onLoad = function (path, callback) {
      self.readTemplate(viewsPath + '/partials', path, locals, callback);
    };
    if (unresolvedPath) {
      this.resolveTemplate(viewsPath, unresolvedPath, locals, function(err, path) {
        if (err) { callback(err); return }
        fs.readFile(path, 'utf8', function(err, str) {
          if (err) { callback(err); return }
          template = self.dust.compileFn(str);
          if (self.cache) self.cacheStore[unresolvedPath] = template;
          template(locals, callback);
        });
      });
    } else {
      callback(new Error("render appelé sans path à résoudre"))
    }
  }
}

// @see https://github.com/linkedin/dustjs/wiki/Dust-Tutorial#Controlling_whitespace_suppression
/**
 * Un dust.optimizers.format qui ne fait rien (pour conserver les espaces)
 * @private
 * @param ctx
 * @param node
 * @returns {*} node tel quel
 */
Renderer.prototype.whiteSpaceKeeper = function(ctx, node) { return node }

/**
 * Désactive la suppression des espaces
 */
Renderer.prototype.disableWhiteSpaceCompression = function () {
  if (this.dust.optimizers.format !== this.whiteSpaceKeeper) {
    this.originalFormat = this.dust.optimizers.format
    this.dust.optimizers.format = this.whiteSpaceKeeper
  }
}

/**
 * Active la suppression des espaces
 */
Renderer.prototype.enableWhiteSpaceCompression = function () {
  if (this.originalFormat) {
    this.dust.optimizers.format = this.originalFormat
    this.originalFormat = null
  }
}

module.exports = Renderer;
