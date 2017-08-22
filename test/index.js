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

/**
 * Override dbSettings with argv
 */
function overrideSettings () {
  let i = 3
  let a
  while (process.argv[i]) {
    a = process.argv[i]
    if (a === '--name') dbSettings.name = process.argv[i + 1]
    if (a === '--host') dbSettings.host = process.argv[i + 1]
    if (a === '--port') dbSettings.port = process.argv[i + 1]
    if (a === '--user') dbSettings.user = process.argv[i + 1]
    if (a === '--pass') dbSettings.password = process.argv[i + 1]
    if (a === '--ssl-cert') dbSettings.sslCert = process.argv[i + 1]
    if (a === '--ssl-key') dbSettings.sslKey = process.argv[i + 1]
    if (a === '--auth-mechanism') dbSettings.authMechanism = process.argv[i + 1]
    if (a === '--auth-source') dbSettings.authSource = process.argv[i + 1]
    if (a === '--pool-size') dbSettings.poolSize = process.argv[i + 1]
    // et on accepte aussi db pour name
    if (a === '--db') dbSettings.name = process.argv[i + 1]
    i += 2
  }
}

/**
 * Connexion à Mongo (on gère pas certif ssl ni kerberos)
 *
 * @param {Callback} next
 */
function connectToMongo (next) {
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
    } else {
      console.log('Connexion mongo OK')
    }
    db.close()
    next()
  })
}

/**
 * Teste la connexion à Mongo
 *
 * @param {Callback} next
 */
function checkMongoConnexion (next) {
  overrideSettings()
  console.log('Lancement avec les paramètres de connexion')
  console.log(dbSettings)
  connectToMongo(next)
}

module.exports = {
  checkMongoConnexion,
  dbSettings
};
