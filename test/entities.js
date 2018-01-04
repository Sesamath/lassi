/* eslint-env mocha */
'use strict'

const assert = require('assert')
const expect = require('chai').expect
const flow = require('an-flow')
const Entities = require('../source/entities')
const _ = require('lodash')
const {checkEntity, getTestEntity, quit, setup} = require('./init')

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

  after(() => {
    entities.close()
    quit()
  })

  describe('.onLoad', function () {
    let count
    beforeEach(function (done) {
      count = 0
      TestEntity = entities.define('TestEntity')
      TestEntity.onLoad(function () {
        this.$loaded = `load-${++count}`
      })
      TestEntity.flush(() => {
        TestEntity.initialize(done)
      })
    })

    it('est appelée après un store de création', (done) => {
      const entity = TestEntity.create({})
      expect(entity.$loaded).to.be.undefined

      entity.store(function (err, storedEntity) {
        if (err) return done(err)
        // .store() doit charger le beforeLoaded.
        // Le but du loaded étant principalement de garder l'état initial des valeurs
        // de l'entity pour appliquer des traitement dans le beforeStore(), il est utile
        // de le recharger après un store (en cas de deuxième store consécutif même si c'est
        // peu probable).
        expect(storedEntity.$loaded).to.equal('load-1')
        done()
      })
    })

    describe('avec une entité en bdd,', () => {
      let storedEntity
      beforeEach((done) => {
        const entity = TestEntity.create({})
        flow()
          .seq(function () {
            entity.store(this)
          })
          .seq(function () {
            TestEntity.match().grabOne(this)
          })
          .seq(function (entity) {
            storedEntity = entity
            this()
          })
          .done(done)
      })

      it('est appelé après un grab', () => {
        expect(storedEntity.$loaded).to.equal('load-2')
      })
      it('est appelé après le beforeStore', (done) => {
        expect(storedEntity.$loaded).to.equal('load-2')
        TestEntity.afterStore(function () {
          const entity = this
          // on a encore la valeur courante (si l'on veut faire des traitement concernant
          // les modifications opérées dans ce store)
          expect(entity.$loaded).to.equal('load-2')
          done()
        })
        storedEntity.store(this)
      })
      it('est appelé après un store', (done) => {
        storedEntity.store(function (err, entity) {
          if (err) return done(err)
          expect(entity.$loaded).to.equal('load-3')
          done()
        })
      })
    })
  })
  describe('.store', function () {
    beforeEach(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.flush(() => {
        TestEntity.initialize(done)
      })
    })

    it('enlève les attributs temporaire en bdd', (done) => {
      const entity = TestEntity.create({nonTemporaire: 1, $temporaire: 2})
      flow()
        .seq(function () {
          entity.store(this)
        })
        .seq(function ({oid}) {
          TestEntity.match('oid').equals(oid).grabOne(this)
        })
        .seq(function (dbEntity) {
          expect(dbEntity.nonTemporaire).to.equal(1)
          expect(dbEntity.$temporaire).to.be.undefined
          this()
        })
        .done(done)
    })

    describe('.beforeStore', () => {
      it(`est appelée avec un oid lors d'une création`, (done) => {
        // Cas d'utilisation principale du afterStore :
        // faire des opération sur l'oid à la fois pour la création et la mise à jour
        TestEntity.afterStore(function () {
          const entity = this
          expect(entity.oid).to.not.be.undefined
          done()
        })
        TestEntity.create({}).store()
      })
    })
  })
})
