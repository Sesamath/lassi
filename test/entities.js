/* eslint-env mocha */
'use strict'

const assert = require('assert')
const expect = require('chai').expect
const flow = require('an-flow')
const Entities = require('../source/entities')
const _ = require('lodash')
const {checkEntity, getTestEntity, setup} = require('./init')

let entities
let TestEntity

// TODO: tester les autres beforeStore, beforeDelete & co
//       ou ramener les tests qui sont dans entities-queries.js
describe('Entity', () => {
  before((done) => {
    flow()
    .seq(function () {
      setup(this)
    })
    .seq(function (Entity, dbSettings) {
      entities = new Entities({database: dbSettings})
      entities.initialize(done)
    })
    .catch(done)
  })

  describe('.onLoad', function () {
    let count = 0;
    before(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.onLoad(function() {
        this.$loaded = `load-${++count}`;
      })
      TestEntity.flush(() => {
        entities.initializeEntity(TestEntity, done);
      })
    })

    it('est appelée après un store et après un grab', (done) => {
      const entity = TestEntity.create({});
      expect(entity.$loaded).to.be.undefined;
      flow()
      .seq(function() {
        entity.store(this)
      })
      .seq(function(storedEntity) {
        // .store() doit charger le beforeLoaded.
        // Le but du loaded étant principalement de garder l'état initial des valeurs
        // de l'entity pour appliquer des traitement dans le beforeStore(), il est utile
        // de le recharger après un store (en cas de deuxième store consécutif même si c'est
        // peu probable).
        expect(storedEntity.$loaded).to.equal('load-1');
        // TODO: on devrait pouvoir faire un grabOne() directement
        TestEntity.match().grabOne(this);
      })
      .seq(function(loadedEntity) {
        expect(loadedEntity.$loaded).to.equal('load-2');
        loadedEntity.store(this)
      })
      .seq(function(loadedEntityAfterStore) {
        expect(loadedEntityAfterStore.$loaded).to.equal('load-3');
        this();
      })
      .done(done)
    })
  })

  describe('.store', function () {
    before(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.flush(() => {
        entities.initializeEntity(TestEntity, done);
      })
    })

    it('enlève les attributs temporaire', (done) => {
      const entity = TestEntity.create({nonTemporaire: 1, $temporaire: 2});
      flow()
      .seq(function() {
        entity.store(this)
      })
      .seq(function(storedEntity) {
        expect(storedEntity.nonTemporaire).to.equal(1);
        expect(storedEntity.$temporaire).to.be.undefined;
        this();
      })
      .done(done)
    })
  })
})
