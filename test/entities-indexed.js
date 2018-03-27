/* eslint-env mocha */
'use strict'
const assert = require('assert')
const flow = require('an-flow')
const chai = require('chai')
const {expect} = chai
const sinonChai = require('sinon-chai')

const {quit, setup} = require('./init')

chai.use(sinonChai)

let TestEntity

describe('Test entities-queries', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity) {
      TestEntity = Entity
      done()
    }).catch(done)
  })

  after('ferme la connexion', quit)

  // Normalement déjà testé par entities-indexes, mais ça mange pas de pain de le vérifier de nouveau
  // dans cette entity plus complète
  it('A créé les index demandés', function (done) {
    flow().seq(function () {
      TestEntity.getCollection().listIndexes().toArray(this)
    }).seq(function (indexes) {
      // Pour visualiser les index rapidement
      // console.log('index de la collection', indexes)
      expect(indexes).to.have.lengthOf(12) // nos 10 indexes + _id_ toujours mis par mongo
      expect(indexes).to.have.lengthOf(13) // nos indexes + _id_ toujours mis par mongo
      this(null, indexes.filter(i => i.name !== '_id_'))
    }).seqEach(function (index) {
      expect(index.name).to.match(/^entity_index_/)
      this()
    }).done(done)
  })

  it('Indexe un boolean null|undefined comme null, falsy comme false et le reste true - verifie isNull|isNotNull', function (done) {
    const entities = [
      {b: true, s: 'boolean true'},
      {b: null, s: 'boolean null'},
      {b: undefined, s: 'boolean undefined'},
      {b: false, s: 'boolean false'},
      {b: 0, s: 'boolean zéro'},
      {b: '', s: 'boolean empty string'},
      {b: 42, s: 'boolean truthy int'},
      {b: 'foo', s: 'boolean truthy string'},
      {b: {}, s: 'boolean truthy obj'},
      {b: new Date(), s: 'boolean truthy date'}
    ]
    flow(entities).seqEach(function (entity) {
      TestEntity.create(entity).store(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 10)
      TestEntity.match('b').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities[0].s, 'boolean null')
      assert.equal(entities[1].s, 'boolean undefined')
      TestEntity.match('b').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 8)
      assert.equal(entities[0].s, 'boolean true')
      assert.equal(entities[1].s, 'boolean false')
      assert.equal(entities[2].s, 'boolean zéro')
      assert.equal(entities[3].s, 'boolean empty string')
      assert.equal(entities[4].s, 'boolean truthy int')
      assert.equal(entities[5].s, 'boolean truthy string')
      assert.equal(entities[6].s, 'boolean truthy obj')
      assert.equal(entities[7].s, 'boolean truthy date')
      TestEntity.match('b').equals(true).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 5)
      assert.equal(entities[0].s, 'boolean true')
      assert.equal(entities[1].s, 'boolean truthy int')
      assert.equal(entities[2].s, 'boolean truthy string')
      assert.equal(entities[3].s, 'boolean truthy obj')
      assert.equal(entities[4].s, 'boolean truthy date')
      TestEntity.match('b').equals(false).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 3)
      assert.equal(entities[0].s, 'boolean false')
      assert.equal(entities[1].s, 'boolean zéro')
      assert.equal(entities[2].s, 'boolean empty string')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe un integer null|undefined comme null, 0 comme 0, false comme 0 - verifie isNull|isNotNull', function (done) {
    flow().seq(function () {
      TestEntity.create({i: null, s: 'int null'}).store(this)
    }).seq(function () {
      TestEntity.create({i: undefined, s: 'int undefined'}).store(this)
    }).seq(function () {
      TestEntity.create({i: 42, s: 'int'}).store(this)
    }).seq(function () {
      TestEntity.create({i: 0, s: 'int zéro'}).store(this)
    }).seq(function () {
      TestEntity.create({i: false, s: 'int false'}).store(this)
    }).seq(function () {
      TestEntity.match('i').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'int null')
      assert.equal(entities[1].s, 'int undefined')
      TestEntity.match('i').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 3)
      assert.equal(entities[0].s, 'int')
      assert.equal(entities[0].i, 42)
      assert.equal(entities[1].s, 'int zéro')
      assert.equal(entities[1].i, 0)
      assert.equal(entities[2].s, 'int false')
      assert.equal(entities[2].i, 0)
      TestEntity.match('i').equals(0).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'int zéro')
      assert.equal(entities[1].s, 'int false')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe une string null|undefined comme null - verifie isNull|isNotNull', function (done) {
    flow().seq(function () {
      TestEntity.create({s: '', i: 1}).store(this)
    }).seq(function () {
      TestEntity.create({s: null, i: 2}).store(this)
    }).seq(function () {
      TestEntity.create({s: undefined, i: 3}).store(this)
    }).seq(function () {
      TestEntity.create({s: 'une string', i: 4}).store(this)
    }).seq(function () {
      TestEntity.match('s').isNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, null)
      assert.equal(entities[0].i, 2)
      assert.equal(entities[1].s, null)
      assert.equal(entities[1].i, 3)
      // on cherche aussi les notNull
      TestEntity.match('s').isNotNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, '')
      assert.equal(entities[0].i, 1)
      assert.equal(entities[1].s, 'une string')
      assert.equal(entities[1].i, 4)
      // et on purge avant de sortir
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe une date null|undefined comme null - verifie isNull|isNotNull', function (done) {
    flow().seq(function () {
      TestEntity.create({d: null, s: 'date null'}).store(this)
    }).seq(function () {
      TestEntity.create({d: undefined, s: 'date undefined'}).store(this)
    }).seq(function () {
      TestEntity.create({d: new Date(), s: 'date'}).store(this)
    }).seq(function () {
      TestEntity.create({d: '2017-01-02', s: 'date string'}).store(this)
    }).seq(function () {
      TestEntity.match('d').isNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'date null')
      assert.equal(entities[1].s, 'date undefined')
      TestEntity.match('d').isNotNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'date')
      assert.equal(entities[1].s, 'date string')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe un tableau de booleans', function (done) {
    let entities = [
      {bArray: [true], s: 'boolean true'},
      {bArray: [null], s: 'boolean null'},
      {bArray: [undefined], s: 'boolean undefined'},
      {bArray: [false], s: 'boolean false'},
      {bArray: [0], s: 'boolean zéro'},
      {bArray: [''], s: 'boolean empty string'},
      {bArray: [42], s: 'boolean truthy int'},
      {bArray: ['foo'], s: 'boolean truthy string'},
      {bArray: [{}], s: 'boolean truthy obj'},
      {bArray: [new Date()], s: 'boolean truthy date'}
    ]
    flow(entities).seqEach(function (entity) {
      TestEntity.create(entity).store(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 10)
      TestEntity.match('bArray').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities[0].s, 'boolean null')
      assert.equal(entities[1].s, 'boolean undefined')
      TestEntity.match('bArray').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 8)
      assert.equal(entities[0].s, 'boolean true')
      assert.equal(entities[1].s, 'boolean false')
      assert.equal(entities[2].s, 'boolean zéro')
      assert.equal(entities[3].s, 'boolean empty string')
      assert.equal(entities[4].s, 'boolean truthy int')
      assert.equal(entities[5].s, 'boolean truthy string')
      assert.equal(entities[6].s, 'boolean truthy obj')
      assert.equal(entities[7].s, 'boolean truthy date')
      TestEntity.match('bArray').equals(true).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 5)
      assert.equal(entities[0].s, 'boolean true')
      assert.equal(entities[1].s, 'boolean truthy int')
      assert.equal(entities[2].s, 'boolean truthy string')
      assert.equal(entities[3].s, 'boolean truthy obj')
      assert.equal(entities[4].s, 'boolean truthy date')
      TestEntity.match('bArray').equals(false).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 3)
      assert.equal(entities[0].s, 'boolean false')
      assert.equal(entities[1].s, 'boolean zéro')
      assert.equal(entities[2].s, 'boolean empty string')
      TestEntity.match().purge(this)
    }).seq(function () {
      // on recommence avec un tableau à plusieurs boolean
      entities = [
        {bArray: [true, 42, true], i: 1},
        {bArray: [null, false], i: 2},
        {bArray: [false, undefined], i: 3},
        {bArray: [true, false], i: 4}
      ]
      this(null, entities)
    }).seqEach(function (entity) {
      TestEntity.create(entity).store(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 4)
      TestEntity.match('bArray').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.map(e => e.i).join(','), '2,3')
      TestEntity.match('bArray').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.map(e => e.i).join(','), '1,4')
      TestEntity.match('bArray').equals(false).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.map(e => e.i).join(','), '2,3,4')
      TestEntity.match('bArray').equals(true).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.map(e => e.i).join(','), '1,4')
      TestEntity.match().purge(this)
    }).done(done)
  })

  describe('index options', () => {
    describe('unique', () => {
      it('prevents having twice the same value', (done) => {
        flow()
          .seq(function () {
            TestEntity.create({
              uniqueString: 'a'
            }).store(this)
          })
          .seq(function () {
            TestEntity.create({
              uniqueString: 'a'
            }).store((err) => {
              if (!err) return done(new Error('expecting an error'))
              expect(err.message).to.equal('E11000 duplicate key error collection: testLassi.TestEntity index: entity_index_uniqueString-unique dup key: { : "a" }')
              done()
            })
          })
          .catch(done)
      })
    })
    describe('unique and sparse', () => {
      it('prevents having twice the same value but accepts null or undefined many times', (done) => {
        flow()
          .seq(function () {
            TestEntity.create({
              uniqueSparseString: null
            }).store(this)
          })
          .seq(function () {
            TestEntity.create({
              uniqueSparseString: null
            }).store(this)
          })
          .seq(function () {
            TestEntity.create({
              uniqueSparseString: undefined
            }).store(this)
          })
          .seq(function () {
            TestEntity.create({
              uniqueSparseString: undefined
            }).store(this)
          })
          .seq(function () {
            TestEntity.create({
              uniqueSparseString: 'a'
            }).store(this)
          })
          .seq(function () {
            TestEntity.create({
              uniqueSparseString: 'a'
            }).store((err) => {
              if (!err) return done(new Error('expecting an error'))
              expect(err.message).to.equal('E11000 duplicate key error collection: testLassi.TestEntity index: entity_index_uniqueSparseString-unique-sparse dup key: { : "a" }')
              done()
            })
          })
          .catch(done)
      })

      it('throws an exception when calling isNull', () => {
        expect(() => TestEntity.match('uniqueSparseString').isNull()).to.throw('isNull() ne peut pas être appelé sur un index sparse')
      })
    })
  })
  // @todo array de date/int/string
})
