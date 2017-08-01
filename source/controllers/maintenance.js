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

const fs = require('fs');

/**
 * Génération du middleware Express.
 * @param  {Object} maintenanceConfig
 * @description Les réglages qui seront appliqués au middleware :
 *              - htmlPage : template utilisé lors du mode maintenance
 *              - message : texte affiché lors d'un retour JSON ou texte
 *              - staticDir : chemin du répertoire où sont stockées d'éventuelles assets utilisées par htmlPage
 * @return {Function} Le middleware de maintenance
 */
module.exports = function maintenanceController (maintenanceConfig) {
  // On retourne serveStatic pour les assets si on le demande via staticDir
  if (maintenanceConfig.staticDir) {
    const serveStatic = require('serve-static');
    maintenanceConfig.app.use(serveStatic(maintenanceConfig.staticDir));
  }

  const message = maintenanceConfig.message || 'Site en maintenance, veuillez réessayer dans quelques instants';
  let htmlResponse
  if (maintenanceConfig.htmlPage) htmlResponse = fs.readFileSync(maintenanceConfig.htmlPage);
  if (!htmlResponse) htmlResponse = `<html><body><p>${message}</p></body></html>`;

  // @see http://expressjs.com/en/4x/api.html#res.format
  const responses = {
    json: () => {
      res.status(503).json({
        success: false,
        error: message
      });
    },
    html: () => {
      res.status(503).send(htmlResponse);
    },
    default: () => {
      res.status(503).send(message);
    }
  }

  return function maintenanceMiddleware (req, res, next) {
    res.format(responses);
    next();
  };
}
