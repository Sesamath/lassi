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

var os = require('os');
var util = require('util');

function CapitaineFlam(application) {
  this.application = application;
  this.settings = this.application.settings.rail.capitaineFlam || {};
}
CapitaineFlam.prototype.generateError = function(request, error) {
  console.log('CROTTE');
  var body = {};
  if (request.user) body.User = JSON.stringify(request.user, undefined, 2);
  body.application = this.application.name+" ["+this.application.staging+'@'+os.hostname()+"]";
  body.request = request.connection.remoteAddress+' ⇨ '+request.method+" "+request.protocol + '://' + request.get('host') + request.originalUrl;
  body.userAgent = request.headers['user-agent'];
  if (request.headers.referer) body.referer = request.headers.referer;
  if (!util.isError(error)) {
    body.message = "It's looking like if there was an error somewhere but the error doesn't look like an error.\n";
    body.message += "Did you make a next(data) instead of next(null, data) somewhere in actions ?\n\n";
    body.message += "You \"not-an-error\" is :\n";
    body.error = error;
  } else {
    body.message = error.toString();
    body.stack = error.stack;
  }
  if (body.stack) {
    var stack = body.stack.split("\n").slice(1);
    for(var i in stack) {
      var match;
      if (match = /^\s+at\s+(\S+)\s+\((\S+):(\d+):(\d+)\)\s*/.exec(stack[i])) {
        stack[i] = {
          function: match[1],
          file: match[2],
          line: match[3],
          col: match[4]
        }
      } else if (match = /^\s+at\s+(\S+):(\d+):(\d+)\s*/.exec(stack[i])) {
        stack[i] = {
          function: 'unknown',
          file: match[1],
          line: match[2],
          col: match[3]
        }
      }
    }
    body.originalStack = body.stack;
    body.stack = stack;

  }
  if (request.session) body.session = request.session;

  return body;
}

/**
 * Middleware très simple de réponse d'une 404 en fin de
 * chaîne express.
 */
CapitaineFlam.prototype.middleware = function() {
  var _this = this;
  return function(error, request, response) {
    var formattedError = _this.generateError(request, error);
    if (!request.__transport || !request.__transport.manageError(request.__context, formattedError)) {
      console.log(error)
      console.log(error.stack)
      response.send(500, error.message)
    }

    if (_this.settings.sendAlert) {
      var nodemailer = require("nodemailer");
      var transport = nodemailer.createTransport("Sendmail", "/usr/sbin/sendmail");
      transport.sendMail({
        from    : "<"+_this.application.mail+"> "+_this.application.name,
        to      : _this.settings.sendAlert,
        subject : "[Critical] Error on "+formattedError.body.Application,
        html    : output
      }, function(error) {
        if (error) console.log(error); // On évite les crashs en cascade...
      });
    }
  }
}

module.exports = CapitaineFlam;
