/* eslint-env mocha */
'use strict'
const flow = require('an-flow')
const {expect} = require('chai')

const {quit, setup} = require('./init')

const log = require('an-log')('$cache')
log.setLogLevel('warning')

let TestEntity

describe('Entity avec index uniques', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    // Evite les erreurs de timeout sur une machine lente (ou circleCI)
    this.timeout(60000)
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity) {
      TestEntity = Entity
      done()
    }).catch(done)
  })

  after('ferme la connexion', quit)

  describe('options.unique', () => {
    it('empêche d’avoir deux fois la même valeur', (done) => {
      flow().seq(function () {
        TestEntity.create({uniqueString: 'a'}).store(this)
      }).seq(function () {
        TestEntity.create({uniqueString: 'a'}).store((err) => {
          if (!err) return done(new Error('expecting a duplicate error'))
          expect(err.message).to.equal('Impossible d’enregistrer pour cause de doublon (valeur "a" en doublon pour TestEntity.uniqueString)')
          done()
        })
      }).catch(done)
    })
  })

  describe('unique and sparse', () => {
    afterEach('purge', function (done) {
      TestEntity.match().purge(done)
    })

    // liste de valeurs pour les props sparse et s
    const values = [
      [null, 'a'],
      ['b', 'b'],
      [undefined, 'c'],
      ['d', 'd']
    ]

    it('unique+sparse empêche d’avoir deux fois la même valeur mais accepte plusieurs null|undefined', (done) => {
      flow().seq(function () {
        TestEntity.create({uniqueSparseString: null}).store(this)
      }).seq(function () {
        TestEntity.create({uniqueSparseString: null}).store(this)
      }).seq(function () {
        TestEntity.create({uniqueSparseString: undefined}).store(this)
      }).seq(function () {
        TestEntity.create({uniqueSparseString: undefined}).store(this)
      }).seq(function () {
        TestEntity.create({uniqueSparseString: 'a'}).store(this)
      }).seq(function () {
        TestEntity.create({uniqueSparseString: 'a'}).store((err) => {
          if (!err) return done(new Error('expecting an error'))
          expect(err.message).to.equal('Impossible d’enregistrer pour cause de doublon (valeur "a" en doublon pour TestEntity.uniqueSparseString)')
          done()
        })
      }).catch(done)
    })

    it('isNull remonte les index unique+sparse inexistants', (done) => {
      flow(values).seqEach(function ([uniqueSparseString, s]) {
        TestEntity.create({uniqueSparseString, s}).store(this)
      }).seq(function () {
        TestEntity.match('uniqueSparseString').isNull().grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(2)
        // on est pas sur de l'ordre (ac ou ca)
        const both = entities[0].s + entities[1].s
        if (both === 'ac') return done()
        expect(both).to.equals('ca')
        this()
      }).seq(function () {
        // on teste aussi que isNull remonte les props absentes
        TestEntity.match('sparseString').isNull().grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(values.length)
        done()
      }).catch(done)
    })

    it('isNull remonte les index sparse inexistants', (done) => {
      flow(values).seqEach(function ([sparseString, s]) {
        TestEntity.create({sparseString, s}).store(this)
      }).seq(function () {
        TestEntity.match('sparseString').isNull().grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(2)
        // on est pas sur de l'ordre (ac ou ca)
        const both = entities[0].s + entities[1].s
        if (both === 'ac') return done()
        expect(both).to.equals('ca')
        this()
      }).seq(function () {
        // on teste aussi que isNull remonte les props absentes
        TestEntity.match('uniqueSparseString').isNull().grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(values.length)
        done()
      }).catch(done)
    })

    it('isNotNull remonte les index unique+sparse existants', (done) => {
      flow(values).seqEach(function ([uniqueSparseString, s]) {
        TestEntity.create({uniqueSparseString, s}).store(this)
      }).seq(function () {
        TestEntity.match('uniqueSparseString').isNotNull().grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(2)
        // on est pas sur de l'ordre (bd ou db)
        const both = entities[0].s + entities[1].s
        if (both === 'bd') return done()
        expect(both).to.equals('db')
        done()
      }).catch(done)
    })

    it('isNotNull remonte les index sparse existants', (done) => {
      flow(values).seqEach(function ([sparseString, s]) {
        TestEntity.create({sparseString, s}).store(this)
      }).seq(function () {
        TestEntity.match('sparseString').isNotNull().grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(2)
        // on est pas sur de l'ordre (bd ou db)
        const both = entities[0].s + entities[1].s
        if (both === 'bd') return done()
        expect(both).to.equals('db')
        done()
      }).catch(done)
    })
  })

  describe('avec unique + onDuplicate', () => {
    function duplicateListener (error, cb) {
      // error
      expect(error).to.be.a('Error')
      expect(error.type).to.equals('duplicate')
      expect(error.message).to.match(/^Impossible d’enregistrer pour cause de doublon \(valeur/)
      // cb
      expect(typeof cb).to.equals('function')
      // this est l'entity qui plante
      checkEntity(this)
      // que l'on passe à cb après une modif
      this.s = afterCbString
      cb(null, this)
    }
    // vérifie que l'on a initProperty qui vaut initValue + les values supplémentaires éventuelles
    function checkEntity (entity, values = {}) {
      expect(entity).to.be.a('Object')
      // on a oid & $loadState si on est passé par un store
      const expectedLength = entity.oid ? testEntityProperties.length + 2 : testEntityProperties.length
      expect(Object.keys(entity)).to.have.length(expectedLength)
      testEntityProperties.forEach(property => {
        if (property === initProperty) {
          expect(entity[initProperty]).to.equals(initValue)
        } else {
          expect(entity).to.have.property(property)
          // si initProperty vaut uniqueString on l'a traité au dessus, sinon c'est affecté dans le constructeur
          if (['oid', 'created', 'uniqueString'].includes(property)) return
          expect(entity[property]).to.equals(values[property], `Pb avec ${property}`)
        }
      })
    }

    const afterCbString = 'afterOnDuplicate'
    let initProperty
    let initValue
    let testEntityProperties
    // avec du `sinon.spy(duplicateListener)` duplicateListener est bien appelé mais on a toujours
    // `but it was called 0 times` sur le spy, on laisse tomber sinon et on vérifie que l'on est
    // bien passé par le listener avec la propriété s qu'il affecte

    before('ajout onDuplicate', () => {
      TestEntity.onDuplicate(duplicateListener)
      testEntityProperties = Object.keys(TestEntity.create())
    })

    ;['uniqueSparseString', 'uniqueString'].forEach(prop => {
      it(`onDuplicate est appelé sur le premier doublon et les suivants (${prop})`, (done) => {
        initProperty = prop
        const getEntity = () => TestEntity.create({[initProperty]: initValue})
        const isSparse = prop === 'uniqueSparseString'
        // si duplicateListener doit avoir été appelé on passe ça à checkEntity
        const duplicateCalledValues = {s: afterCbString}
        // si sparse, pas de doublon sur null|undefined, sinon les deux doublonnent sur null
        const checkNullValues = isSparse ? {} : duplicateCalledValues

        flow().seq(function () {
          initValue = null
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity)
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity, checkNullValues)
          initValue = undefined
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity, checkNullValues)
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity, checkNullValues)
          // on affecte une valeur
          initValue = 'a'
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity)
          // un 2e store ne déclenche pas de duplicate
          entity.store(this)
        }).seq(function (entity) {
          checkEntity(entity) // s est bien undefined
          // on crée un doublon
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity, {s: afterCbString})
          // un 2e doublon
          getEntity().store(this)
        }).seq(function (entity) {
          checkEntity(entity, {s: afterCbString})
          initValue = 'b'
          const e = getEntity()
          e.store(this)
        }).seq(function (entity) {
          checkEntity(entity)
          done()
        }).catch(done)
      })
    })
  })
})
