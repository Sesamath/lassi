'use strict'

const fs = require('fs')
const express = require('express')

  /**
   * Renvoie un middleware capable d'afficher une page de maintenance complète (assets statiqueset réponse http)
   * @param {Object} maintenanceConfig             Les réglages qui seront appliqués au middleware :
   * @param {boolean} maintenanceConfig.active     booléen indiquant s'il faut activer le mode maintenance (prioritaire sur le lockFile)
   * @param {string} maintenanceConfig.lockFile    chemin du fichier indiquant si le mode maintenance est activé
   * @param {string} [maintenanceConfig.message]   message de maintenance à afficher
   * @param {string} [maintenanceConfig.htmlPage]  chemin relatif à la racine d'une page html à afficher
   * @param {string} [maintenanceConfig.staticDir] chemin relatif à la racine indiquant des éléments statiques pour htmlPage
   * @return {function(req, res, next)} Middleware express
   */
module.exports = (maintenanceConfig) => {
  const maintenanceMiddleware = express.Router()
  const message = maintenanceConfig.message || 'Site en maintenance, veuillez réessayer dans quelques instants'

  // read file appel synchrone, fait uniquement au bootstrap
  const htmlResponse = maintenanceConfig.htmlPage ?
    fs.readFileSync(maintenanceConfig.htmlPage) :
    `<html><body><p>${message}</p></body></html>`

  // Le middleware de maintenance sert les assets si on le demande via staticDir
  if (maintenanceConfig.staticDir) {
    maintenanceMiddleware.use(require('serve-static')(maintenanceConfig.staticDir))
  }

  maintenanceMiddleware.use(function(req, res, next) {
    // @see http://expressjs.com/en/4x/api.html#res.format
    res.format({
      json: () => {
        res.status(503).json({
          success: false,
          error: message,
        })
      },
      html: () => {
        res.status(503).send(htmlResponse)
      },
      default: () => {
        res.status(503).send(message)
      },
    })
  })

  return maintenanceMiddleware
}
