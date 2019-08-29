/* eslint-env mocha */
'use strict'

const MongoClient = require('mongodb').MongoClient
const anLog = require('an-log')
const flow = require('an-flow')
const _ = require('lodash')
const {expect} = require('chai')
const { hasProp } = require('sesajstools')

const Entities = require('../source/entities')

const dbSettings = {
  name: 'testLassi',
  host: 'localhost',
  port: 27017,
  authMechanism: 'DEFAULT',
  authSource: '',
  options: {
    poolSize: 10
  }
}

if (!process.env.CIRCLE_CI) {
  dbSettings.user = dbSettings.password = 'mocha'
}

let isVerbose = false

// variables en global ici pour quit (pour savoir ce qui a été créé)
// init par initEntities, reset par quit
let entities
// init par initTestEntity (via setup), reset par quit
let TestEntity

/**
 * Override dbSettings with argv
 * @private
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
        i-- // y'a du +2 à la fin, on ne veut ici décaler que de 1
        break

      // ceux avec valeur qui suit
      case '--name':
      case '--db': // alias
        dbSettings.name = process.argv[i + 1]
        break
      case '--host': dbSettings.host = process.argv[i + 1]; break
      case '--port': dbSettings.port = process.argv[i + 1]; break
      case '--user': dbSettings.user = process.argv[i + 1]; break
      case '--pass': dbSettings.password = process.argv[i + 1]; break
      case '--ssl-cert': dbSettings.sslCert = process.argv[i + 1]; break
      case '--ssl-key': dbSettings.sslKey = process.argv[i + 1]; break
      case '--auth-mechanism': dbSettings.authMechanism = process.argv[i + 1]; break
      case '--auth-source': dbSettings.authSource = process.argv[i + 1]; break
      case '--pool-size': dbSettings.poolSize = process.argv[i + 1]; break
      default:
        i-- // pour que ça ne fasse que +1 ci-dessous
    }
    i += 2
  }
}

/**
 * Vérifie que l'entité est de la forme attendue
 *
 * @param {TestEntity}  entity Entité
 * @param {object} [values] Pour chacune des propriétés fournies vérifie que la valeur est celle attendue
 * @param {object} [checkers] Liste de fonctions, pour chacune des propriétés fournies, appelle la fonction avec la valeur (faut mettre assert ou expect dans cette fonction)
 */
function checkEntity (entity, values, checkers) {
  // vérif des types
  expect(typeof entity.i).to.equal('number')
  expect(entity.d).to.be.a('Date')
  expect(typeof entity.s).to.equal('string')
  expect(Array.isArray(entity.sArray)).to.be.true
  expect(Array.isArray(entity.iArray)).to.be.true
  expect(Array.isArray(entity.dArray)).to.be.true
  // type du contenu des tableaux
  entity.dArray.every(value => expect(value).to.be.a('Date'))
  entity.iArray.every(value => expect(value).to.be.a('number'))
  entity.sArray.every(value => expect(value).to.be.a('string'))
  // vérif des valeurs éventuelles
  if (values) {
    Object.keys(values).forEach(k => expect(entity[k]).to.equal(values[k]))
  }
  // appels des checkers éventuels
  if (checkers) {
    Object.keys(checkers).forEach(k => checkers[k](entity[k]))
  }
  expect(entity.created.constructor.name).to.equal('Date')
  if (entity.oid) expect(entity.oid.length).to.equal(24)
}

/**
 * @callback checkMongoConnexionCallback
 * @param {Error} error
 * @param {object} dbSettings
 */
/**
 * Teste la connexion à Mongo (on gère pas certif ssl ni kerberos)
 * @private
 * @param {checkMongoConnexionCallback} next
 */
function checkMongoConnexion (next) {
  connectToMongo((error, client) => {
    // en cas d'erreur, le process s'arrête avant d'exécuter ça…
    if (error) {
      console.error('La connexion mongoDb a échoué')
      return next(error)
    }
    client.close()
    next(null, dbSettings)
  })
}

/**
 * File une connexion à next
 * @see http://mongodb.github.io/node-mongodb-native/2.0/api/Db.html
 * @private
 * @param {MongoClient~connectCallback} next
 */
function connectToMongo (next) {
  const {name, host, port, authMechanism} = dbSettings
  let url = 'mongodb://'
  if (dbSettings.user && dbSettings.password) {
    url += `${encodeURIComponent(dbSettings.user)}:${encodeURIComponent(dbSettings.password)}@`
  }
  url += `${host}:${port}/${name}?authMechanism=${authMechanism}`
  if (dbSettings.authSource) url += `&authSource=${dbSettings.authSource}`
  const {options} = dbSettings
  options.useNewUrlParser = true
  // à partir de la version 3.1 il faut passer ça pour éviter un warning
  if (!hasProp(options, 'useNewUrlParser')) options.useNewUrlParser = true
  if (!hasProp(options, 'useUnifiedTopology')) options.useUnifiedTopology = true
  MongoClient.connect(url, options, next)
}

/**
 * Initialisation de TestEntity
 * @private
 * @param {Callback} next appelé avec (error, TestEntity)
 */
function initTestEntity (next) {
  flow().seq(function () {
    initEntities(this)
  }).seq(function (entities) {
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {
    TestEntity.construct(function () {
      this.created = new Date()
      this.i = undefined
      this.s = undefined
      this.d = undefined
      this.t = undefined
      this.wathever = undefined // pour tester un index non typé
      this.controlled = undefined // avec un normalizer
      this.controlledTyped = undefined // avec un normalizer + type
      this.uniqueString = `this is unique ${_.uniqueId()}`
      this.uniqueSparseString = undefined
      this.sparseString = undefined
      this.bArray = undefined
      this.dArray = undefined
      this.iArray = undefined
      this.sArray = undefined
      this.controlled = undefined
      this.controlledTyped = undefined
    })
    TestEntity.defineIndex('b', 'boolean')
    TestEntity.defineIndex('d', 'date')
    TestEntity.defineIndex('i', 'integer')
    TestEntity.defineIndex('s', 'string')
    TestEntity.defineIndex('t', 'string')
    TestEntity.defineIndex('uniqueString', 'string', {unique: true})
    TestEntity.defineIndex('uniqueSparseString', 'string', {sparse: true, unique: true})
    TestEntity.defineIndex('sparseString', 'string', {sparse: true})
    TestEntity.defineIndex('iPair', 'integer', function () {
      if (typeof this.i === 'number') return this.i % 2
    })
    TestEntity.defineIndex('bArray', 'boolean')
    TestEntity.defineIndex('dArray', 'date')
    TestEntity.defineIndex('iArray', 'integer')
    TestEntity.defineIndex('sArray', 'string')
    TestEntity.defineIndex('created')
    TestEntity.defineIndex('whatever')
    // normalizer qui fait du lowerCase sur les string, round sur les number et null sur le reste
    const normalizer = (value) => typeof value === 'string'
      ? value.toLowerCase()
      : typeof value === 'number'
        ? Math.round(value)
        : null
    TestEntity.defineIndex('controlled', {normalizer})
    TestEntity.defineIndex('controlledTyped', 'string', {normalizer}, function () {
      return this.controlledTyped + 'Typed'
    })
    TestEntity._initialize(this)
  }).seq(function () {
    next(null, TestEntity)
  }).catch(next)
}

/**
 * Supprime la collection TestEntity si on l'avait créée et
 * ferme la connexion à la db si elle avait été ouverte (par setup ou initEntities)
 */
function quit (next) {
  flow().seq(function () {
    if (!TestEntity) return this()
    TestEntity.flush(this)
    TestEntity = null
  }).seq(function () {
    if (!entities) return this()
    entities.close(this)
    // on affecte null tout de suite au cas où y'aurait un appel à initEntities
    entities = null
  }).seq(function () {
    next()
  }).catch(next)
}

/**
 * @callback setupCallback
 * @param {Error} [error]
 * @param {EntityDefinition} Entity L'entity de test (4 champs, 7 indexes, cf init pour le détail)
 */
/**
 * Teste la connexion à Mongo et initialise TestEntity
 * @param {setupCallback} next
 */
function setup (next) {
  if (TestEntity) return next(null, TestEntity)
  overrideSettings()
  if (isVerbose) console.log('Lancement avec les paramètres de connexion\n', dbSettings)
  // pour les tests on veut qu'ils se taisent
  anLog('EntityDefinition').setLogLevel('error')
  flow().seq(function () {
    checkMongoConnexion(this)
  }).seq(function () {
    initTestEntity(this)
  }).done(next)
}

/**
 * Init entities connectées à la base, pour pouvoir ensuite faire du entities.define(…)
 * @param next
 * @return {*}
 */
function initEntities (next) {
  if (entities) return next(null, entities)
  if (!dbSettings) overrideSettings()
  // pour les tests on veut qu'ils se taisent
  anLog('EntityDefinition').setLogLevel('error')
  entities = new Entities({database: dbSettings})
  entities.initialize((error) => {
    if (error) return next(error)
    next(null, entities)
  })
}

module.exports = {
  checkEntity,
  initEntities,
  quit,
  setup
}
