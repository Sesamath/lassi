/* eslint-env mocha */
'use strict'

const {expect} = require('chai')
const flow = require('an-flow')

const Entities = require('../source/entities')
const {quit, setup} = require('./init')

let entities
let TestEntity

const testEntities = [
  { i: 42000, text1: 'bar', text2: 'foo', type: 'foo' },
  { i: 42001, text1: 'foo', text2: 'foo bar', type: 'bar' },
  { i: 42002, text1: 'foo', text2: 'bar', type: 'foo' },
  { i: 42003, text1: 'foo bar baz', text2: 'bar', type: 'baz' },
  { i: 42004, text1: 'foo bar', text2: 'bar', type: 'bar' },
  { i: 42005, text1: 'bar baz', text2: 'bar', type: 'bar' },
  { i: 42006, text1: 'foo bar baz', type: 'bar' },
  { i: 42007, text2: 'baz', type: 'bar' }
]

function initEntities (dbSettings, next) {
  entities = new Entities({database: dbSettings})
  flow().seq(function () {
    entities.initialize(this)
  }).seq(function () {
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {
    TestEntity.defineIndex('type', 'string')
    TestEntity.defineIndex('text1', 'string')
    TestEntity.defineTextSearchFields([['text1', 2], 'text2'])
    TestEntity._initialize(this)
  }).done(next)
}

describe('Test entities-search', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    this.timeout(60000)
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity, dbSettings) {
      initEntities(dbSettings, this)
    }).done(done)
  })

  after(() => {
    entities.close()
    quit()
  })

  describe('.textSearch()', function () {
    let createdEntities

    // création + store
    beforeEach(function (done) {
      flow(testEntities).seqEach(function (entity) {
        TestEntity.create(entity).store(this)
      }).seq(function (instances) {
        createdEntities = instances
        done()
      }).catch(done)
    })

    // Cleanup
    afterEach(function (done) {
      flow(createdEntities).seqEach(function (entity) {
        entity.delete(this)
      }).done(done)
    })

    it('Fait une recherche sur plusieurs champs (avec respect des poids)', function (done) {
      TestEntity.match().textSearch('foo').grab(function (error, results) {
        if (error) return done(error)
        expect(results.length).to.equal(6)
        // 42001 arrive premier car il a "foo" dans les champs text1 ET text2
        expect(results[0].i).to.equal(42001)
        // puis 42002 car résultat exact sur text1 > text2
        expect(results[1].i).to.equal(42002)
        // puis 42004 et 42003 / 42006 car text1 > text2 (et 50% mieux que 33% des mots)
        expect(results[2].i).to.equal(42004)
        expect(results[3].i).to.equal(42003)
        expect(results[4].i).to.equal(42006)
        // puis 42000
        expect(results[5].i).to.equal(42000)
        done()
      })
    })
    it('Count sur plusieurs champs', function (done) {
      TestEntity.match().textSearch('foo').count(function (error, total) {
        if (error) return done(error)
        expect(total).to.equal(6)
        done()
      })
    })

    it('Fait une recherche sur plusieurs mots', function (done) {
      TestEntity.match().textSearch('foo bar').grab(function (error, results) {
        if (error) return done(error)
        expect(results.length).to.equal(7)
        // 42004 arrive premier car il a un "foo bar" exact
        expect(results[0].i).to.equal(42004)
        // puis 42004 car "foo bar" en text1
        expect(results[1].i).to.equal(42003)
        // puis 42001 car "foo bar" en text2
        expect(results[2].i).to.equal(42001)
        // et les autres
        done()
      })
    })

    it('Fait une recherche exacte', function (done) {
      TestEntity.match().textSearch('"foo bar"').grab(function (error, results) {
        if (error) return done(error)
        expect(4).to.equal(results.length)
        expect(results[0].i).to.equal(42004)
        expect(results[1].i).to.equal(42003)
        expect(results[2].i).to.equal(42001)
        expect(results[3].i).to.equal(42006)
        done()
      })
    })

    it('Fait une recherche qui ne remonte rien', function (done) {
      TestEntity.match().textSearch('rab').grab(function (error, results) {
        if (error) return done(error)
        expect(0).to.equal(results.length)
        done()
      })
    })

    it('Fait une recherche text avec un match sur un index non text', function (done) {
      TestEntity.match('type').equals('foo').textSearch('foo').grab(function (error, results) {
        if (error) return done(error)
        expect(2).to.equal(results.length)
        expect(results[0].i).to.equal(42002)
        expect(results[1].i).to.equal(42000)
        done()
      })
    })

    it('Fait une recherche sur plusieurs mots avec un match', function (done) {
      TestEntity.match('type').equals('bar').textSearch('foo bar').grab(function (error, results) {
        if (error) return done(error)
        expect(4).to.equal(results.length)
        // 42004 arrive premier car il a un "foo bar" exact
        expect(results[0].i).to.equal(42004)
        expect(results[1].i).to.equal(42001)
        expect(results[2].i).to.equal(42006)
        expect(results[3].i).to.equal(42005)
        done()
      })
    })

    it('Fait une recherche exacte avec un match', function (done) {
      TestEntity.match('type').equals('bar').textSearch('"foo bar"').grab(function (error, results) {
        if (error) return done(error)
        expect(3).to.equal(results.length)
        // exact sur text1
        expect(results[0].i).to.equal(42004)
        // exact sur text2
        expect(results[1].i).to.equal(42001)
        // sur text1
        expect(results[2].i).to.equal(42006)
        done()
      })
    })

    it('Fait une recherche inexacte avec un match', function (done) {
      TestEntity.match('type').equals('foo').textSearch('baz').grab(function (error, results) {
        if (error) return done(error)
        expect(0).to.equal(results.length)
        done()
      })
    })

    it('Fait une recherche sur plusieurs champs avec un sort', function (done) {
      TestEntity.match().textSearch('foo').sort('type', 'desc').grab(function (error, results) {
        if (error) return done(error)
        expect(results.length).to.equal(6)
        // le score sur le champ texte prime sur le tri (on veut pas faire remonter du peu pertinent)
        // on a donc 42001 en 1er car foo sur les deux champs
        expect(results[0].i).to.equal(42001)
        // 2 : 42002 42003 42004 => triés par type desc
        // puis 42002 car match exact sur text1
        expect(results[1].i).to.equal(42002)
        // puis 42004 car text1 avec un mot sur deux
        expect(results[2].i).to.equal(42004)
        // puis 42003 et 42006 à égalité car text1 avec un mot sur trois, c'est le sort type qui départage
        expect(results[3].i).to.equal(42003)
        expect(results[4].i).to.equal(42006)
        // puis 42000 car text2
        expect(results[5].i).to.equal(42000)
        done()
      })
    })
  })
})
