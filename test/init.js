/* eslint-env mocha */
'use strict'

const MongoClient = require('mongodb').MongoClient

let dbSettings = {
  name: 'testLassi',
  host : 'localhost',
  port: 27017,
  user: 'mocha',
  password: 'mocha',
  authMechanism: 'DEFAULT',
  authSource: '',
  options: {
    poolSize: 10
  }
}
let isInitDone = false
let isVerbose = false

/**
 * Override dbSettings with argv
 */
function overrideSettings () {
  let i = 3
  let a
  while (process.argv[i]) {
    a = process.argv[i]
    switch (a) {
      // les arguments sans valeur d'abord
      case '-v':
      case '--verbose':
      case '--debug':
        isVerbose = true
        i-- // y'a du +2 à la fin
        break

      // ceux avec valeur qui suit
      case '--name':
      case '--db': // alias
        dbSettings.name = process.argv[i + 1]
        break
      case '--host': dbSettings.host = process.argv[i + 1]; break
      case '--port': dbSettings.port = process.argv[i + 1]; break
      case '--user': dbSettings.user = process.argv[i + 1]; break
      case '--pass': dbSettings.password = process.argv[i + 1]; break
      case '--ssl-cert': dbSettings.sslCert = process.argv[i + 1]; break
      case '--ssl-key': dbSettings.sslKey = process.argv[i + 1]; break
      case '--auth-mechanism': dbSettings.authMechanism = process.argv[i + 1]; break
      case '--auth-source': dbSettings.authSource = process.argv[i + 1]; break
      case '--pool-size': dbSettings.poolSize = process.argv[i + 1]; break
      default:
        console.error(`argument ${a} ignoré car non géré`)
        i--
    }
    i += 2
  }
}

/**
 * Connexion à Mongo (on gère pas certif ssl ni kerberos)
 *
 * @param {Callback} next
 */
function connectToMongo (next) {
  if (isInitDone) return next(null, dbSettings)
  const {name, host, port, authMechanism} = dbSettings
  let url = 'mongodb://'
  // ssl prioritaire sur user/pass
  if (dbSettings.user && dbSettings.password) {
    url += `${encodeURIComponent(dbSettings.user)}:${encodeURIComponent(dbSettings.password)}@`
  }
  url += `${host}:${port}/${name}?authMechanism=${authMechanism}`
  if (dbSettings.authSource) url += `&authSource=${dbSettings.authSource}`
  const {options} = dbSettings
  MongoClient.connect(url, options, (error, db) => {
    // en cas d'erreur, le process s'arrête avant d'exécuter ça…
    if (error) {
      console.error('La connexion mongoDb a échoué')
      return next(error)
    }
    db.close()
    next(null, dbSettings)
  })
}

/**
 * Teste la connexion à Mongo et passe les settings à next
 * @param {Callback} next
 */
module.exports = function init (next) {
  overrideSettings()
  if (isVerbose) console.log('Lancement avec les paramètres de connexion\n', dbSettings)
  connectToMongo(next)
}
