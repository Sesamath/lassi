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
var date = require('dateformat');
var colors = require('colors');
var utils = require('util');
var tty = require('tty');

var Levels = {
  debug: -1,
  info:0,
  warning: 1,
  error: 2,
  critical: 3
}
function Logger() {}
Logger.prototype.log = function(){
  var time = '['+colors.grey(date(new Date(), 'HH:MM:ss'))+']';
  var args = Array.prototype.slice.call(arguments);
  var level = args.shift();
  //if (level<Levels.info) return;
  var message = utils.format.apply(console, args);
  var isatty = tty.isatty(1);
  var color = isatty;

  if (color) {
    switch (level) {
      case Levels.debug    : color = colors.cyan; break;
      case Levels.info     : color = null; break;
      case Levels.warning  : color = colors.yellow; break;
      case Levels.error    : color = colors.red; break;
      case Levels.critical : color = colors.red; break;
    }
  }

  if (color) {
    console.log(time, color(message));
  } else {
    message = time + ' ' + message;
    if (!isatty) {
      message = message.replace(/\x1b\[[^m]+m/g, '');
      message = message.replace(/\x1b/g, '');
    }
    console.log(message);
  }
  return this;
};

function logLevel(level) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(Levels[level]);
    var isatty = tty.isatty(1);
    this.log.apply(this, args);
  }
}

for(var level in Levels) Logger.prototype[level] = logLevel(level);

Logger.prototype.deprecated = function(name, instead) {
  var error = new Error(name + ' is deprecated, use '+instead+' instead.'+' '.white);
  Error.captureStackTrace(error, Logger.prototype.deprecated);
  var stack = error.stack
  this.warning(stack.toString());
}

Logger.prototype.tap = function(f) {
  var _this = this;
  return function(a,b,v) {
    _this.log(arguments);
    f.apply(_this, Array.prototype.slice.call(arguments));
  };
}



module.exports = Logger;

