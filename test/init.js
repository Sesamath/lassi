/* eslint-env mocha */
'use strict'

const MongoClient = require('mongodb').MongoClient
const anLog = require('an-log')
const anLogLevels = require('an-log/source/lib/levels.js')
const assert = require('assert')
const flow = require('an-flow')
const Entities = require('../source/entities')

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

let TestEntity

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
 * Vérifie que l'entité est de la forme attendue
 *
 * @param {TestEntity}  entity Entité
 * @param {object} values Pour chacune des propriétés fournies vérifie que la valeur est celle attendue
 * @param {object} checkers Liste de fonctions, pour chacune des propriétés fournies, appelle la fonction avec la valeur (faut mettre assert ou expect dans cette fonction)
 */
function checkEntity (entity, values, checkers) {
  // vérif des types
  assert.equal(typeof entity.i, 'number')
  assert.equal(entity.d.constructor.name, 'Date')
  assert.equal(typeof entity.s, 'string')
  assert(Array.isArray(entity.sArray))
  assert(Array.isArray(entity.iArray))
  assert(Array.isArray(entity.dArray))
  // type du contenu des tableaux
  entity.dArray.every(value => assert.equal(true, typeof value === 'object' && value.constructor.name === 'Date'))
  entity.iArray.every(value => assert.equal(true, typeof value === 'number'))
  entity.sArray.every(value => assert.equal(true, typeof value === 'string'))
  // vérif des valeurs éventuelles
  if (values) {
    Object.keys(values).forEach(k => assert.equal(entity[k], values[k]))
  }
  // appels des checkers éventuels
  if (checkers) {
    Object.keys(checkers).forEach(k => checkers[k](entity[k]))
  }
  assert.equal(entity.created.constructor.name, 'Date')
  if (entity.oid) assert.equal(entity.oid.length, 24)
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
    }
    db.close()
    next(null, dbSettings)
  })
}

/**
 * Initialisation de l'entité de test
 *
 * @param {Callback} next
 */
function initEntities(next) {
  const entities = new Entities({database: dbSettings})
  flow().seq(function() {
    entities.initialize(this)
  }).seq(function() {
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {
    TestEntity.construct(function () {
      this.created = new Date()
      this.i = undefined
      this.s = undefined
      this.d = undefined
    })
    TestEntity.defineIndex('i', 'integer')
    TestEntity.defineIndex('s', 'string')
    TestEntity.defineIndex('d', 'date')
    TestEntity.defineIndex('iPair', 'integer', function () {
      return this.i % 2
    })
    TestEntity.defineIndex('iArray', 'integer')
    TestEntity.defineIndex('sArray', 'string')
    TestEntity.defineIndex('dArray', 'date')

    entities.initializeEntity(TestEntity, this)
  }).seq(function () {
    next (null, TestEntity)
  }).catch(next)
};

/**
 * Teste la connexion à Mongo et passe les settings à next
 * @param {setupCallback} next
 */
function setup (next) {
  if (isInitDone) return next(null, TestEntity, dbSettings)
  overrideSettings()
  if (isVerbose) console.log('Lancement avec les paramètres de connexion\n', dbSettings)
  // pour les tests on veut qu'ils se taisent
  anLog.config({
    EntityDefinition: {logLevel: anLogLevels.ERROR},
    EntityQuery: {logLevel: anLogLevels.ERROR},
    lassi: {logLevel: anLogLevels.ERROR}
  })
  connectToMongo(error => {
    if (error) return next(error)
    initEntities((error, Entity) => {
      if (error) return next(error)
      isInitDone = true
      next(null, Entity, dbSettings)
    })
  })
}

module.exports = {
  checkEntity,
  getDbSettings: () => dbSettings,
  getTestEntity: () => TestEntity,
  setup
}

/**
 * @callback setupCallback
 * @param {Error} [error]
 * @param {EntityDefinition} Entity L'entity de test (4 champs, 7 indexes, cf init pour le détail)
 * @param {object} dbSettings Au cas où ça interesse pour attaquer mongo directement
 */
