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
var _            = require('lodash');

// constructeur
function JsonTransport() { }

JsonTransport.prototype.process = function(data, next) {
  var result = {};
  _.each(data, function(v,k) {
    if (k.charAt(0)!=='$') result[k] = v;
  })
  // si le controleur veut renvoyer un array et pas un objet, il peut mettre son array dans une propriété arrayOnly
  if (result.arrayOnly && result.arrayOnly instanceof Array) result = result.arrayOnly

  next(null, result);
}

module.exports = JsonTransport;
