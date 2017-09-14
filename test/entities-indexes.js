/* eslint-env mocha */
'use strict'

const assert = require('assert')
const expect = require('chai').expect
const flow = require('an-flow')
const moment = require('moment')
const Entities = require('../source/entities')
const EntitiesCli = require('../source/services/entities-cli')()
const init = require('./init')
const _ = require('lodash')

let entities
let TestEntity

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
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {
    TestEntity.defineIndex('indexedAttribute', 'integer')
    entities.initializeEntity(TestEntity, this)
  }).done(next)
}

describe('Test entities-indexes', function () {

  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      init(this)
    }).seq(function (dbSettings) {
      initEntities(dbSettings, this)
    }).done(done)
  })

  describe("l'initialisation d'une nouvelle collecion par une Entity - créée dans initEntities", function () {
    it('crée un index mongoDB', function (done) {
      TestEntity.getMongoIndexes(function(err, indexes) {
        const index = _.find(indexes, { name: TestEntity.getMongoIndexName('indexedAttribute')})
        assert.equal(index.key.indexedAttribute, 1)
        done()
      })
    })
  })

  describe("on modifie la définition d'une collection existante", function() {
    describe('on enlève un attribut indexé', function (done) {
      before(function (done) {
        // Plus d'index
        TestEntity = entities.define('TestEntity')
        // On ne flush() pas pour conserver la collection pre-existante
        entities.initializeEntity(TestEntity, done)
      })

      it("supprime l'index existant", function (done) {
        TestEntity.getMongoIndexes(function(err, indexes) {
          const index = _.find(indexes, { name: TestEntity.getMongoIndexName('indexedAttribute')})
          assert.equal(index, undefined)
          done()
        })
      })
    })

    describe('on ajoute un autre attribu indexé', function() {
      before(function (done) {
        // Plus d'index
        TestEntity = entities.define('TestEntity')
        TestEntity.defineIndex('indexedAttribute', 'integer')
        TestEntity.defineIndex('anotherIndexedAttribute', 'string')
        // On ne flush() pas pour conserver la collection pre-existante
        entities.initializeEntity(TestEntity, done)
      })

      it('crée le nouvel index mongo', function(done) {
        TestEntity.getMongoIndexes(function(err, indexes) {
          const oldIndex = _.find(indexes, { name: TestEntity.getMongoIndexName('indexedAttribute')})
          const newIndex = _.find(indexes, { name: TestEntity.getMongoIndexName('anotherIndexedAttribute')})
          assert(!!oldIndex)
          assert.equal(newIndex.key.anotherIndexedAttribute, 1)
          done()
        })
      })
    })
  })

})
