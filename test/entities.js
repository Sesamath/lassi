/* eslint-env mocha */
'use strict'

const assert = require('assert')
const flow = require('an-flow')
const Entities = require('../source/entities')
const init = require('./init')

const nbEntities = 1500 // doit être supérieur à la hard limit de lassi
const bt = 1041476706000
const minute = 60 * 1000
const STRING_PREFIX = 'test-'

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
  assert.equal(entity.d.constructor.name, 'Date')
  assert.equal(typeof entity.s, 'string')
  assert.equal(entity.i, i)
  assert.equal(entity.s, STRING_PREFIX + i)
  assert.equal(entity.d.getTime(), bt + minute * i)
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

/**
 * Ajout des données aux entités
 *
 * @param {Callback} next
 */
function addData (next) {
  const entities = []
  for (let i = 0; i < nbEntities; i++) {
    const d = new Date(bt + minute * i)
    entities.push(TestEntity.create({
      i: i,
      s: STRING_PREFIX + i,
      d: d,
      iArray: [
        i * 3,
        i * 3 + 1,
        i * 3 + 2
      ],
      sArray: [
        STRING_PREFIX + (i * 3),
        STRING_PREFIX + (i * 3 + 1),
        STRING_PREFIX + (i * 3 + 2)
      ],
      dArray: [
        new Date(d),
        new Date(d + 3600000),
        new Date(d + 7200000)
      ]
    }))
  }

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
function initEntities(dbSettings, next) {
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

    TestEntity.defineIndex('type', 'string')
    TestEntity.defineIndex('text1', 'string')
    TestEntity.defineIndex('text2', 'string')
    TestEntity.defineTextSearchFields(['text1', 'text2'])

    entities.initializeEntity(TestEntity, error => {
      if (error) {
        // @FIXME, pas normal ça
        if (error.message === `Database ${dbSettings.name} doesn't exist`) console.log(`Mongo trouve pas ${dbSettings.name} mais on continue`)
        else return this(error)
      }
      this()
    })
  }).seq(function () {
    addData(this)
  }).done(next)
}

describe('$entities', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      init(this)
    }).seq(function (dbSettings) {
      initEntities(dbSettings, this)
    }).done(done)
  })

  it('A créé les index demandés', function (done) {
    const db = TestEntity.getDb()
    flow().seq(function () {
      TestEntity.getCollection().listIndexes().toArray(this)
    }).seq(function (indexes) {
      console.log('indexes de la collection', indexes)
    }).done(done)
  })
  require('./entities-queries')(TestEntity, assertEntity)
  require('./entities-search')(TestEntity, assertEntity)
});
