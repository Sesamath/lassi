/* eslint-env mocha */
'use strict'

const assert = require('assert')
const constants = require('./constants.js')
const MongoClient = require('mongodb').MongoClient

/**
 * Vérifie si l'entité est celle attendue
 *
 * @param {Integer} i      Identifiant de l'entité
 * @param {Object}  entity Entité
 */
function assertEntity (i, entity) {
  assert.equal(typeof entity.i, 'number')
  assert.equal(entity.d.constructor.name, 'Date')
  assert.equal(typeof entity.s, 'string')
  assert.equal(entity.i, i)
  assert.equal(entity.s, constants.STRING_PREFIX + i)
  assert.equal(entity.d.getTime(), constants.BT + constants.MINUTE * i)
  assert(Array.isArray(entity.sArray))
  assert(Array.isArray(entity.iArray))
  assert(Array.isArray(entity.dArray))
  assert.equal(entity.sArray.length, 3)
  assert.equal(entity.iArray.length, 3)
  assert.equal(entity.dArray.length, 3)
  assert.equal(typeof entity.iArray[0], 'number')
  assert.equal(typeof entity.sArray[0], 'string')
  assert.equal(entity.dArray[0].constructor.name, 'Date')
  assert.equal(entity.created.constructor.name, 'Date')
  if (entity.oid) assert.equal(entity.oid.length, 24)
}

let dbSettings = {
  name: 'testLassi',
  host : 'localhost',
  port: 27017,
  // user: 'mocha',
  // password: 'mocha',
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
  assertEntity,
  checkMongoConnexion,
  dbSettings
};
