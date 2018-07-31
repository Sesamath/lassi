/* eslint-env mocha */
'use strict'

const expect = require('chai').expect
const flow = require('an-flow')
const Entities = require('../source/entities')
const {quit, setup} = require('./init')

let entities
let TestEntity

// cf https://github.com/epoberezkin/ajv-keywords#instanceof, faut l'ajouter
// mais ça marche pas :-/
// require('ajv-keywords').get('instanceof').definition.CONSTRUCTORS.TestClass = TestClass

const resetTestEntity = (overrides, done) => {
  if (typeof overrides === 'function') {
    done = overrides
    overrides = {}
  }
  TestEntity = entities.define('TestEntity')
  const testShema = {
    type: 'object',
    properties: {
      oid: {type: 'string'},
      array: {instanceof: 'Array'},
      boolean: {type: 'boolean'},
      date: {instanceof: 'Date'},
      number: {type: 'number'},
      object: {
        type: 'object',
        properties: {
          prop1String: {type: 'string'},
          prop2number: {type: 'number'}
        },
        additionalProperties: true
      },
      string: {type: 'string'}
      // testClass: {instanceof: 'TestClass'}
    },

    required: ['string', 'date'],

    errorMessage: {
      properties: {
        string: 'Erreur de string',
        number: 'Erreur de nombre'
      }
    }
  }
  Object.assign(testShema, overrides)
  TestEntity.validateJsonSchema(testShema)
  TestEntity.flush(() => {
    TestEntity._initialize(done)
  })
}

describe('Entity#validateJsonSchema', () => {
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

  describe('rejette un objet invalide', function () {
    beforeEach(resetTestEntity)

    it('aucune prop obligatoire les signale toutes', (done) => {
      TestEntity.create({}).store(function (error, storedEntity) {
        try {
          expect(error.message).to.equals('TestEntity requiert la propriété date (oid: undefined value: {}), TestEntity requiert la propriété string (oid: undefined value: {})')
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })
    it('une seule prop obligatoire manquante est signalée', (done) => {
      TestEntity.create({date: new Date()}).store(function (error, storedEntity) {
        try {
          expect(error.message).to.match(/^TestEntity requiert la propriété string/)
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })
    it('Un type invalide est signalé', function (done) {
      TestEntity.create({date: new Date(), string: 'foo', number: 'bar'}).store(function (error, storedEntity) {
        try {
          expect(error.message).to.match(/^TestEntity\/number Erreur de nombre/)
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })
    it('Un type invalide est signalé en plus d’une propriété obligatoire manquante', function (done) {
      TestEntity.create({string: 'foo', number: 'bar'}).store(function (error, storedEntity) {
        try {
          expect(error.message).to.match(/TestEntity requiert la propriété date \([^)]+\), TestEntity\/number Erreur de nombre \([^)]+\)/)
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })
    it('Signale plusieurs types invalides', function (done) {
      TestEntity.create({
        date: new Date(),
        string: 'foo',
        number: '42',
        boolean: 'bar'
      }).store(function (error, storedEntity) {
        try {
          expect(error.message).to.match(/^TestEntity\/boolean doit être de type boolean \([^)]+\), TestEntity\/number Erreur de nombre \([^)]+\)/)
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })

    it('Rejette une date qui n’en est pas une', function (done) {
      TestEntity.create({
        date: 'foo',
        string: 'bar',
        number: 42
      }).store(function (error, storedEntity) {
        try {
          expect(error.message).to.match(/^TestEntity\/date should pass "instanceof" keyword validation/)
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })
    it('Rejette une date qui n’en est pas une', function (done) {
      TestEntity.create({
        date: 'foo',
        string: 'bar',
        number: 42
      }).store(function (error, storedEntity) {
        try {
          expect(error.message).to.match(/^TestEntity\/date should pass "instanceof" keyword validation/)
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })

    it.skip('rejette une propriété qui n’aurait pas le constructeur perso requis', function (done) {
      TestEntity.create({
        date: new Date(),
        string: 'bar',
        // un objet qui ressemble sans avoir le bon constructeur
        testClass: {className: 'TestClass'}
      }).store(function (error, storedEntity) {
        try {
          expect(error.message).to.equals('TestEntity/testClass should pass "instanceof" keyword validation')
          expect(storedEntity).to.equal(undefined)
          done()
        } catch (error) {
          done(error)
        }
      })
    })
  })

  describe('Accepte un objet valide', function () {
    beforeEach(resetTestEntity)

    it('store toutes les données si c’est valide', function (done) {
      const data = {
        array: ['bar', 43],
        boolean: false,
        date: new Date(),
        number: 42,
        object: {
          prop1String: 'baz'
        },
        string: 'foo'
        // testClass: new TestClass()
      }
      TestEntity.create(data).store(function (error, storedEntity) {
        try {
          expect(!error).to.be.true
          expect(storedEntity.oid).to.be.a('string')
          expect(!!storedEntity.oid).to.be.true
          // storedEntity doit avoir tout data
          Object.keys(data).forEach(prop => expect(storedEntity[prop]).to.deep.equals(data[prop]))
          done()
        } catch (error) {
          done(error)
        }
      })
    })
  })
})
