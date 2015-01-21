'use strict';
/*
 * @preserve This file is part of "lassi".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var _ = require('underscore')._;
var sanitizeHtml = require('sanitize-html');
var Tools = module.exports;
/**
 * Fonction fauchée ici : http://forbeslindesay.github.io/express-route-tester/
 * car le module https://github.com/component/path-to-regexp marche finalement
 * moins bien...
 */
Tools.pathtoRegexp = function pathtoRegexp(path, keys, options) {
    options = options || {};
    var sensitive = options.sensitive;
    var strict = options.strict;
    keys = keys || [];

    if (path instanceof RegExp) return path;
    if (path instanceof Array) path = '(' + path.join('|') + ')';

    path = path
      .concat(strict ? '' : '/?')
      .replace(/\/\(/g, '(?:/')
      .replace(/\+/g, '__plus__')
      .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function(_, slash, format, key, capture, optional){
        keys.push({ name: key, optional: !! optional });
        slash = slash || '';
        return ''
          + (optional ? '' : slash)
          + '(?:'
          + (optional ? slash : '')
          + (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')'
          + (optional || '');
      })
      .replace(/([\/.])/g, '\\$1')
      .replace(/__plus__/g, '(.+)')
      .replace(/\*/g, '(.*)');

    return new RegExp('^' + path + '$', sensitive ? '' : 'i');
  }

Tools.toCamelCase = function(string){
	return string.replace(/(\-[a-z])/g, function($1){return $1.toUpperCase().replace('-','');});
}

Tools.underscoreToCamelCase = function(string){
	return string.replace(/(_[a-z])/g, function($1){return $1.toUpperCase().replace('_','');});
}


Tools.toUnderscore = function(string, separator){
  separator = separator || '_';
	return (string[0].toLowerCase()+string.substr(1)).replace(/([A-Z])/g, function($1){return separator+$1.toLowerCase();});
};

Tools.update = function(object, from) {
  Object.getOwnPropertyNames(from).forEach(function(property) {
      Object.defineProperty(
        object, property,
        Object.getOwnPropertyDescriptor(from, property));
  });
  return object;
}

/**
 * Fusionne les nouvelles valeurs avec les propriétés de l'objet (en profondeur)
 * (concatène si les deux propriétés sont des tableaux, en virant d'éventuels doublons,
 * fusionne si c'est deux objets et écrase sinon)
 * @param {Object} object L'objet source
 * @param {Object} newValues Les valeurs à fusionner
 */
Tools.merge = function(object, newValues) {
  function mergeArray(arDest, arSrc) {
    var s, d;
    for (s = 0; s < arSrc.length; s++) {
      for (d = 0; d < arDest.length; d++) {
        if (_.equals(arSrc[s], arDest[d])) break;
        else if (d === arDest.length - 1) arDest.push(arSrc[s]);
      }
    }
  }
  function mergeObj(obj, values) {
    _.each(values, function(value, key) {
      if (_.isArray(value) && _.isArray(obj[key])) mergeArray(obj[key], value);
      else if (_.isObject(value) && _.isObject(obj[key])) mergeObj(obj[key], value);
      else obj[key] = value;
    })
  }
  mergeObj(object, newValues);
}

Tools.clone = function(object) {
  var copy = Object.create(Object.getPrototypeOf(object));
  Tools.update(copy, object);
  return copy;
}

Tools.stripTags = function (source) {
  return source.replace(/(<([^>]+)>)/ig,"");
}

Tools.stripExtended = function(source) {
  return source.replace(/([^(\x20-\x7F)]|\(|\)|\[|^])/, '');
}

Tools.stripEmptyParagraphs = function(text) {
  if (!_.isString(text)) return text;
  return text.replace(/\s*<p[^>]*>(\s|&nbsp;)*<\/p>\s*/ig, '');
  return $text;
}

Tools.teaser = function(body, size) {
  if (body.length <= size) return body;

  var teaser = body.substr(0, size);
  var max_rpos = teaser.length
  var min_rpos = max_rpos;
  var reversed = teaser.split('').reverse().join('');
  var breakPoints = [
    { '</p>' : 0 },
    { '<br />' : 6, '<br>' : 4 },
    {'. '  : 1, '! ' : 1, '? ' : 1, '。' : 0, '؟ ' : 1}
  ];
  var rpos;
  breakPoints.forEach(function(points) {
    _.each(points, function(offset, point)  {
      point = point.split('').reverse().join('');
      rpos = reversed.indexOf(point);
      if (rpos !== -1) {
        min_rpos = Math.min(rpos + offset, min_rpos);
      }
    });
    if (min_rpos !== max_rpos) {
      return (min_rpos === 0) ? teaser : teaser.substr(teaser.length - min_rpos)+'…';
    }
  });

  return Tools.htmlCorrector(teaser);
}

Tools.sanitizeFilePath = function (source) {
  source = Tools.removeDiacritics(source);
  source = source.replace(/[\s\.;,-:\(\)"!\?]+/g, ' ').trim();
  source = source.toLowerCase(source);
  return source;
}

Tools.removeDiacritics = function(source) {
  return source.replace(/([^(\x20-\x7F)]|\(|\)|\[|^])/, '');
}

/**
 * Vire les espaces et les caractères de contrôle d'une chaine
 * @see http://unicode-table.com/en/
 * @param {string} source La chaîne à nettoyer
 * @returns {string} La chaîne nettoyée
 */
Tools.sanitizeHashKey = function(source) {
  return source.replace(/\x00-\x20\x7F-\xA0]/, '');
}

var noNesting = {li:'li', p:'p'};
var singleUse = {
  base: 'base', meta: 'meta', link: 'link', hr: 'hr', br: 'br', param: 'param',
  img: 'img', area: 'area', input: 'input', col: 'col', fram: 'frame'};

Tools.htmlCorrector = function(text) {
  var result, split=[], index=0, i = 0;

  // D'abbord on split la chaînes en alternance délimiter/contenus
  var pattern = /<(!--.*?--|[^>]+?)>/g;
  while (result = pattern.exec(text)) {
    split.push(text.slice(index, result.index));
    index = result.index+result[0].length;
    var resarr = Array.prototype.slice.call(result);
    for (i = 1; i < resarr.length; i++) {
      if (result[i] !== undefined) {
        split.push(result[i]);
      }
    }
  }
  split.push(text.slice(index, text.length));

  var tag = false;
  var stack = [];
  var output = '';
  var value;
  var tagNameTokens;
  var tagName;
  for(var i=0; i < split.length; i++) {
    value= split[i];
    if (tag) {
      if (value.substr(0, 3) == '!--') {
        output += '<'+value+'>';
      } else {
        var tagNameTokens = value.toLowerCase().split(/\s+/);
        var tagName = tagNameTokens[0];
        if (tagName.charAt(0) == '/') {
          tagName = tagName.substr(1);
          if (!singleUse[tagName]) {
            if (_.contains(stack, tagName)) {
              do {
                output += '</'+stack[0]+'>';
              } while (stack.shift() != tagName);
            }
          }
        } else {
          if (stack.length && (stack[0] == tagName) && noNesting[stack[0]]) {
            output += '</'+stack.shift()+'>';
          }
          if (!singleUse[tagName]) {
            stack.unshift(tagName);
          } else {
            value = value.replace(/ \/$/, '')+' /';
          }
          output += '<'+value+'>';
        }
      }
    } else {
      output += value;
    }
    tag = !tag;
  }
  while (stack.length > 0) output += '</'+stack.shift()+'>';
  return output;
}


Tools.filterXss = function(source, options) {
  options = options || {
    allowedTags: [
      'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'nl', 'li',
      'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div', 'table',
      'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span'
    ],
    allowedAttributes: {
      span: ['class', 'id'],
      div: ['class', 'id'],
      li: ['class', 'id'],
      a: [ 'href', 'name', 'target', 'class', 'id' ],
      img: [ 'src' ]
    },
    selfClosing: [ 'img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta' ],
    allowedSchemes: [ 'http', 'https', 'ftp', 'mailto' ]
  }
  return sanitizeHtml(source, options);
}

/**
 * Idem JSON.stringify mais en cas de ref circulaire sur une propriété on renvoie quand même les autres
 * (avec le message d'erreur de JSON.stringify sur la propriété à pb)
 * @param obj
 * @returns {string}
 */
Tools.stringify = function(obj, indent) {
  var buffer;
  if (obj) {
    // ça peut planter en cas de ref circulaire
    try {
      buffer = indent ? JSON.stringify(obj, null, indent):JSON.stringify(obj);
    } catch (error) {
      // on tente une construction à la main pour chacun des 1ers niveaux
      var pile = [];
      _.each(obj, function(value, key) {
        buffer = '"' + key + '":';
        try {
          buffer += indent ? JSON.stringify(obj, null, indent):JSON.stringify(obj);
        } catch (error) {
          buffer += '"stringifyError : ' + error.toString() +'"';
        }
        pile.push(buffer)
      });
      buffer = '{' +pile.join(',') +'}';
    }
  }
  return buffer;
}

Tools.register = function(path, ressource) {
  if (_.isString(path)) path = path.split('.');
  var root = GLOBAL;
  while(path.length) {
    var part = path.shift();
    if (path.length) {
      if (!root[part]) root[part] = {};
      root = root[part];
    } else {
      if (root[part]) {
        if (_.isObject(root[part])) root[part] = [ root[part] ];
        root[part].push(ressource);
      } else {
        root[part] = ressource;
      }
    }
  }
  return ressource;
}
