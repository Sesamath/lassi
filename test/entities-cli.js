/* eslint-env mocha */
'use strict'

const assert = require('assert')
const assertEntity = require('./index.js').assertEntity
const constants = require('./constants.js')
const flow = require('an-flow')
const Entities = require('../source/entities')
const checkMongoConnexion = require('./index.js').checkMongoConnexion
const dbSettings = require('./index.js').dbSettings

const nbEntities = 2

let entities
let TestEntity

/**
 * Ajout des données aux entités
 *
 * @param {Callback} next
 */
function addData (next) {
  const entities = []
  for (let i = 0; i < nbEntities; i++) {
    entities.push(TestEntity.create({
      i: i,
      // __deletedAt: new Date()
    }))
  }
  entities.forEach(function (entity, i) {
    assertEntity(i, entity)
  })
  flow(entities).seqEach(function (entity, i) {
    const nextSeq = this
    entity.store(function (error, entity) {
      if (error) return nextSeq(error)
      assertEntity(i, entity)
      nextSeq()
    })
  }).done(next)
}

/**
 * Initialisation des entités
 *
 * @param {Callback} next
 */
function initEntities(next) {
  entities = new Entities({database: dbSettings})
  flow().seq(function() {
    entities.initialize(this)
  }).seq(function() {
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {
    TestEntity.construct(function () {
      this.created = new Date()
      this.i = undefined
      this.__deletedAt = new Date()
    })
    TestEntity.defineIndex('i', 'integer')
    TestEntity.defineIndex('__deletedAt', 'date')

    entities.initializeEntity(TestEntity, this)
  }).seq(function () {
    addData(this)
  }).done(next)
}

describe('$entities-cli', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      checkMongoConnexion(this)
    }).seq(function () {
      initEntities(this)
    }).done(done)
  })

  describe('.purge()', function () {
    it('Purge une entité', function (done) {
      // TODO Add logic
      console.log('OK');
      done()
    })
  })
});
