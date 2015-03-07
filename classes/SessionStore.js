"use strict";
/*
 * This file is part of "Lassi".
 *    Copyright 2009-2014 arNuméral
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

var Store = require('express-session/session/store');
var util = require('util')

/**
 * Système de stockage des sessions en mémoire avec capacité de
 * serialisation/reprise sur disque.  C'est avant tout une implémentation de
 * l'interface Store d'ExpressSession.
 *
 * @param {Application} application L'application à laquelle se rattachent les sessions.
 * @param {Object} options Des options passées à ExpressSession.Store.
 * @class
 * @extends ExpressSession.Store
 * @constructor
 */
function SessionStore(application, options) {
  this.$cache = application.services.resolve('$cache');
  options = options || {};
  Store.call(this, options)
  this.application = application;
  /*
  var file = lassi.fs.join(this.application.settings.layout.temp, "sessions.json");
  lassi.fs.readFile(file, function(error, data) {
  if (error) {
  if (error.code=='ENOENT') return;
  throw error;
  }
  lassi.log.info('Loading sessions from '+file);
  if (data) {
  try { data = JSON.parse(data); }
  catch (error) { data = {}; }
  lassi.sessions = data;
  }
  });
  */
}
util.inherits(SessionStore, Store)

/**
 * Helper pour lancer une fonction sur le prochain tick dans
 * le contexte de SessionStore.
 * @private
 */
SessionStore.prototype.defer = function (fn){
  if (typeof fn === 'undefined') return;
  process.nextTick(fn.bind.apply(fn, arguments));
}

/** @inheritDoc */
SessionStore.prototype.get = function(sid, callback) {
  var self = this;
  self.$cache.get('session::'+sid, function(error, session) {
    if (error) return self.defer(callback, error);
    if (session) {
      self.defer(callback, null, session);
    } else {
      self.defer(callback);
    }
  });
}

/** @inheritDoc */
SessionStore.prototype.set = function(sid, session, callback) {
  var self = this;
  self.$cache.set('session::'+sid, session, 24*3600, function(error) {
    if (error) return self.defer(callback, error);
    self.defer(callback);
  });
}

/** @inheritDoc */
SessionStore.prototype.destroy = function(sid, callback) {
  var self = this;
  self.$cache.delete('session::'+sid, function(error) {
    if (error) return self.defer(callback, error);
    self.defer(callback);
  });
}

/**
 * @inheritDoc
 * @fires SessionStore#store
 */
/*
  store: function() {
  var data = JSON.stringify(lassi.sessions);
  var target = lassi.fs.join(this.application.settings.layout.temp, "sessions.json");
  lassi.fs.writeFileSync(target, data);
  }
*/
module.exports = SessionStore;
