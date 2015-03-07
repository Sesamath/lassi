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

// constructeur
function RawTransport(application) {
  this.application = application;
}

RawTransport.prototype.process = function(context, next) {
  var action = context.action;
  if (action.constructor.name == 'Action') {
    action.execute(context, function(error, data) {
      if (error) return next(error);
      next();
    });
  } else {
    next(new Error('why do I have to process '+action.constructor.name+'['+action.name+'] in a JSON transport ?'))

  }
}
RawTransport.prototype.manageError = function() { return false; }

module.exports = RawTransport;
