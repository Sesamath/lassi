/* eslint-env mocha */
'use strict'

const assert = require('assert')
const {expect} = require('chai')
const flow = require('an-flow')
const moment = require('moment')
const Entities = require('../source/entities')
const EntitiesCli = require('../source/services/entities-cli')()
const {checkEntity, connectToMongo, getTestEntity, setup} = require('./init')
const _ = require('lodash')

let entities
let SimpleEntity

/**
 * Initialisation des entités
 *
 * @param {Callback} next
 */
function initEntities(dbSettings, next) {
  entities = new Entities({database: dbSettings})
  flow().seq(function() {
    entities.initialize(this)
  }).seq(function() {
    SimpleEntity = entities.define('SimpleEntity')
    SimpleEntity.flush(this)
  }).seq(function () {
    SimpleEntity.defineIndex('index1', 'integer')
    SimpleEntity.defineIndex('index2', 'string')
    entities.initializeEntity(SimpleEntity, this)
  }).done(next)
}

describe('Test entities-indexes', function () {
  let db

  before('Connexion à Mongo et initialisation des entités', function (done) {
    let dbSettings
    flow().seq(function () {
      setup(this)
    }).seq(function (TestEntity, _dbSettings) {
      dbSettings = _dbSettings
      // on laisse tomber le TestEntity pour notre SimpleEntity, mais avant on crée la collection
      // si elle n'existe pas pour lui ajouter des index et vérifier qu'ils sont virés ensuite
      connectToMongo(this)
    }).seq(function (_db) {
      db = _db
      db.createCollection('SimpleEntity', this)
    }).seq(function () {
      db.createIndex('SimpleEntity', 'indexToDrop', this)
    }).seq(function () {
      initEntities(dbSettings, this)
    }).done(done)
  })

  after('ferme la connexion parallèle (pour check en direct sur mongo)', (done) => {
    db.close(done)
  })

  describe("l'initialisation d'une nouvelle collecion par une Entity - créée dans initEntities", function () {
    it('vire les index non lassi', function (done) {
      const coll = db.collection('SimpleEntity')
      coll.listIndexes().toArray((error, indexes) => {
        if (error) return done(error)
        // on vérifie juste que l'on a nos deux index et aucun autre
        // (pas les préfixes de nom défini dans lassi, c'est fait plus loin)
        expect(indexes).to.have.length(3)
        let idIndex, index1, index2
        indexes.forEach(i => {
          if (i.name === '_id_') idIndex = i
          else if (i.key && i.key.index1) index1 = i
          else if (i.key && i.key.index2) index2 = i
        })
        expect(idIndex).to.have.property('name')
        expect(index1).to.have.property('name')
        expect(index2).to.have.property('name')
        done()
      })
    })

    it('crée un index mongoDB', function (done) {
      SimpleEntity.getMongoIndexes(function (err, indexes) {
        const index = _.find(indexes, { name: SimpleEntity.getMongoIndexName('index1')})
        assert.equal(index.key.index1, 1)
        done()
      })
    })
  })

  describe("on modifie la définition d'une collection existante", function() {
    describe('on enlève un attribut indexé', function (done) {
      before(function (done) {
        // Plus d'index
        SimpleEntity = entities.define('SimpleEntity')
        // On ne flush() pas pour conserver la collection pre-existante
        entities.initializeEntity(SimpleEntity, done)
      })

      it("supprime l'index existant", function (done) {
        SimpleEntity.getMongoIndexes(function (err, indexes) {
          const index = _.find(indexes, { name: SimpleEntity.getMongoIndexName('index1')})
          assert.equal(index, undefined)
          done()
        })
      })
    })

    describe('on ajoute un autre attribu indexé', function () {
      before(function (done) {
        // Plus d'index
        SimpleEntity = entities.define('SimpleEntity')
        SimpleEntity.defineIndex('index1', 'integer')
        SimpleEntity.defineIndex('anotherIndexedAttribute', 'string')
        // On ne flush() pas pour conserver la collection pre-existante
        entities.initializeEntity(SimpleEntity, done)
      })

      it('crée le nouvel index mongo', function (done) {
        SimpleEntity.getMongoIndexes(function (err, indexes) {
          const oldIndex = _.find(indexes, { name: SimpleEntity.getMongoIndexName('index1')})
          const newIndex = _.find(indexes, { name: SimpleEntity.getMongoIndexName('anotherIndexedAttribute')})
          assert(!!oldIndex)
          assert.equal(newIndex.key.anotherIndexedAttribute, 1)
          done()
        })
      })
    })
  })

  it('créer un index d’un type inconnu throw une erreur', (done) => {
    const createInvalidIndex = () => SimpleEntity.defineIndex('foo', 'bar')
    expect(createInvalidIndex).to.throw(Error)
    done()
  })
})
