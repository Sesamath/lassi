/* eslint-env mocha */
'use strict'

const assert = require('assert')
const flow = require('an-flow')

const Entities = require('../source/entities')
const {checkEntity, getTestEntity, setup} = require('./init')

let TestEntity;

function initEntities(dbSettings, next) {
  const entities = new Entities({database: dbSettings})
  flow().seq(function() {
    entities.initialize(this)
  }).seq(function() {
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {

    TestEntity.defineIndex('type', 'string')
    TestEntity.defineIndex('text1', 'string')
    TestEntity.defineIndex('text2', 'string')
    TestEntity.defineTextSearchFields(['text1', 'text2'])

    entities.initializeEntity(TestEntity, this)
  }).done(next)
}

describe('Test entities-search', function() {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity, dbSettings) {
      initEntities(dbSettings, this)
    }).done(done)
  })

  describe('.textSearch()', function () {
    let createdEntities;
    beforeEach(function (done) {
      const entities = [
        { i: 42000, text1: 'foo', text2: 'bar', type: 'foo' },
        { i: 42001, text1: 'foo', text2: 'foo', type: 'bar' },
        { i: 42002, text1: 'bar', text2: 'bar', type: 'foo' },
        { i: 42003, text1: 'foo bar', text2: 'bar', type: 'bar' },
      ];
      flow(entities)
      .seqEach(function (entity) {
        TestEntity.create(entity).store(this);
      })
      .seq(function (instances) {
        createdEntities = instances;
        this();
      })
      .done(done);
    })
    afterEach(function (done) {
      // Cleanup
      flow(createdEntities)
      .seqEach(function (entity) {
        entity.delete(this);
      })
      .done(done);
    })

    it('Fait une recherche sur plusieurs champs', function (done) {
      TestEntity.match().textSearch('foo').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(results.length, 3);
        // 42001 arrive premier car il a "foo" dans les champs text1 ET text2
        assert.equal(results[0].i, 42001);
        assert.equal(results[1].i, 42000);
        assert.equal(results[2].i, 42003);
        done();
      })
    })

    it('Fait une recherche sur plusieurs mots', function (done) {
      TestEntity.match().textSearch('foo bar').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(results.length, 4);
        // 42003 arrive premier car il a un "foo bar" exact
        assert.equal(results[0].i, 42003);
        done();
      })
    })

    it('Fait une recherche exacte', function (done) {
      TestEntity.match().textSearch('"foo bar"').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(1, results.length);
        assert.equal(results[0].i, 42003);
        done();
      })
    })

    it('Fait une recherche inexacte', function (done) {
      TestEntity.match().textSearch('baz').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(0, results.length);
        done();
      })
    })

    it('Fait une recherche avec un match', function (done) {
      TestEntity.match('type').equals('foo').textSearch('foo').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(1, results.length);
        assert.equal(results[0].i, 42000);
        done();
      })
    })

    it('Fait une recherche sur plusieurs mots avec un match', function (done) {
      TestEntity.match('type').equals('bar').textSearch('foo bar').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(2, results.length);
        // 42003 arrive premier car il a un "foo bar" exact
        assert.equal(results[0].i, 42003);
        assert.equal(results[1].i, 42001);
        done();
      })
    })

    it('Fait une recherche exacte avec un match', function (done) {
      TestEntity.match('type').equals('bar').textSearch('"foo bar"').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(1, results.length);
        assert.equal(results[0].i, 42003);
        done();
      })
    })

    it('Fait une recherche inexacte avec un match', function (done) {
      TestEntity.match('type').equals('foo').textSearch('baz').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(0, results.length);
        done();
      })
    })

    it('Fait une recherche sur plusieurs champs avec un sort', function (done) {
      TestEntity.match().textSearch('foo').sort('type', 'desc').grab(function (error, results) {
        if (error) return done(error);
        assert.equal(results.length, 3);
        // 42001 arrive premier car il a "foo" dans les champs text1 ET text2
        assert.equal(results[0].i, 42001);
        // 42000 arrive second car on a trié par type en ordre décroissant
        assert.equal(results[1].i, 42000);
        assert.equal(results[2].i, 42003);
        done();
      })
    })
  });
});
