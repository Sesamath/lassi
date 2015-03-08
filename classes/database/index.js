'use strict';
/*
 * @preserve This file is part of "lassi-example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var DatabaseClient = require('./DatabaseClient');
/**
 * Classe de gestion des bases de données.
 * @class
 */
function DatabaseManager() { }

  /**
   * Récupération de l'instance du manager.
   * @static
   */
DatabaseManager.instance = function() {
  if (!this._instance) {
    this._instance = new DatabaseManager();
  }
  return this._instance;
}

/**
 * Création d'un client.
 * @param {object} settings le record d'établissement de la connexion.
 * @return {DatabaseClient} Le client.
 */
DatabaseManager.prototype.createClient = function(settings, callback) {
  var client = settings.client;
  var clientInstance;
  clientInstance = new DatabaseClient(settings.connection);
  clientInstance.client = client;
  clientInstance.initialize(callback);
}

module.exports = DatabaseManager;



