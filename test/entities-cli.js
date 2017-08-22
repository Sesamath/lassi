/* eslint-env mocha */
'use strict'

const assert = require('assert')
const flow = require('an-flow')
const moment = require('moment')
const Entities = require('../source/entities')
const EntitiesCli = require('../source/services/entities-cli')()
const checkMongoConnexion = require('./index.js').checkMongoConnexion
const dbSettings = require('./index.js').dbSettings

let entities
let TestEntity

/**
 * Vérifie si l'entité est celle attendue
 *
 * @param {Integer} i      Identifiant de l'entité
 * @param {Object}  entity Entité
 */
function assertEntity (i, entity) {
  assert.equal(typeof entity.i, 'number')
  assert.equal(entity.i, i)
  if (entity.oid) assert.equal(entity.oid.length, 24)
}

/**
 * Ajout des données aux entités
 *
 * @param {Callback} next
 */
function addData (next) {
  const entities = [
    { i: 1000, __deletedAt: moment().subtract(5, 'days').toDate() },
    { i: 1001, __deletedAt: moment().subtract(10, 'days').toDate() },
    { i: 1002, __deletedAt: moment().subtract(15, 'days').toDate() },
  ];
  flow(entities)
  .seqEach(function (entity) {
    const nextSeq = this;
    TestEntity.create(entity).store(function (error, entity) {
      if (error) return nextSeq(error)
      nextSeq()
    });
  })
  .done(next);
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
      flow().seq(function () {
        TestEntity.match().onlyDeleted().count(this)
      }).seq(function (count) {
        assert.equal(count, 3)
        EntitiesCli.commands().purge(TestEntity, 13, this)
      }).seq(function () {
        TestEntity.match().onlyDeleted().grab(this)
      }).seq(function (entities) {
        assert.equal(entities.length, 2)
        assert.equal(entities[0].i, 1000)
        assert.equal(entities[1].i, 1001)
        this()
      }).done(done)
    })
  })
});
