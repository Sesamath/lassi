/* eslint-env mocha */
'use strict'

const {expect} = require('chai')
const flow = require('an-flow')
const {initEntities, quit} = require('./init')
const _ = require('lodash')

let entities
let SimpleEntity

describe('Test entities-indexes', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    // Evite les erreurs de timeout sur une machine lente (ou circleCI)
    this.timeout(60000)
    flow().seq(function () {
      initEntities(this)
    }).seq(function (_entities) {
      entities = _entities
      SimpleEntity = entities.define('SimpleEntity')
      SimpleEntity.flush(this)
    }).seq(function () {
      SimpleEntity.defineIndex('index1', 'integer')
      SimpleEntity.defineIndex('index2', 'string')
      SimpleEntity.defineIndex('indexTypeless')
      SimpleEntity.defineIndex('indexUnique', {unique: true})
      SimpleEntity.defineIndex('indexSparse', {sparse: true})
      SimpleEntity.defineIndex('indexUniqueSparse', {unique: true, sparse: true})
      SimpleEntity._initialize(done)
    }).catch(done)
  })

  after('Supprime la collection en partant', (done) => {
    flow().seq(function () {
      if (!SimpleEntity) return this()
      SimpleEntity.flush(this)
    }).seq(function () {
      quit(this)
    }).done(done)
  })

  describe("l'initialisation d'une nouvelle collecion par une Entity - créée dans initSimpleEntity", function () {
    it('vire les index non lassi', function (done) {
      const db = SimpleEntity.getDb()
      const coll = db.collection('SimpleEntity')
      coll.listIndexes().toArray((error, indexes) => {
        if (error) return done(error)
        // on vérifie juste que l'on a nos 8 index positionnés sur les bons attributs
        expect(indexes).to.have.length(8)
        const [idIndex, index1, index2, indexTypeless, indexUnique, indexSparse, indexUniqueSparse, indexDeleted] = indexes
        expect(idIndex.key).to.deep.equal({ _id: 1 })
        expect(idIndex.name).to.equal('_id_')

        expect(index1.key).to.deep.equal({ index1: 1 })
        expect(index1.name).to.equal('entity_index_index1')

        expect(index2.key).to.deep.equal({ index2: 1 })
        expect(index2.name).to.equal('entity_index_index2')

        // Un index sans type ni option sparse peut être indexé sur _data
        expect(indexTypeless.key).to.deep.equal({ '_data.indexTypeless': 1 })
        expect(indexTypeless.name).to.equal('entity_index_indexTypeless-data')

        // Un index unique sans type, idem
        expect(indexUnique.key).to.deep.equal({ '_data.indexUnique': 1 })
        expect(indexUnique.name).to.equal('entity_index_indexUnique-data-unique')

        // Par contre l'index sparse passe par un index dédié
        expect(indexSparse.key).to.deep.equal({ 'indexSparse': 1 })
        expect(indexSparse.name).to.equal('entity_index_indexSparse-sparse')

        expect(indexUniqueSparse.key).to.deep.equal({ 'indexUniqueSparse': 1 })
        expect(indexUniqueSparse.name).to.equal('entity_index_indexUniqueSparse-unique-sparse')
        // et l'index __deletedAt en dernier
        expect(indexDeleted.key).to.deep.equal({ __deletedAt: 1 })
        expect(indexDeleted.name).to.equal('__deletedAt')
        done()
      })
    })

    it('crée un index mongoDB', function (done) {
      SimpleEntity.getMongoIndexes(function (error, indexes) {
        if (error) return done(error)
        const index = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index1')})
        expect(index.key.index1).to.equal(1)
        done()
      })
    })
  })

  describe("on modifie la définition d'une collection existante", function () {
    describe('on enlève un attribut indexé', function (done) {
      before(function (done) {
        // Plus d'index
        SimpleEntity = entities.define('SimpleEntity')
        // On ne flush() pas pour conserver la collection pre-existante
        SimpleEntity._initialize(done)
      })

      it("supprime l'index existant", function (done) {
        SimpleEntity.getMongoIndexes(function (error, indexes) {
          if (error) return done(error)
          const index = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index1')})
          expect(index).to.equal(undefined)
          done()
        })
      })
    })

    describe('on ajoute un autre attribu indexé', function () {
      before(function (done) {
        // Plus d'index
        SimpleEntity = entities.define('SimpleEntity')
        SimpleEntity.defineIndex('index1', 'integer')
        SimpleEntity.defineIndex('anotherIndexedAttribute', 'string')
        // On ne flush() pas pour conserver la collection pre-existante
        SimpleEntity._initialize(done)
      })

      it('crée le nouvel index mongo', function (done) {
        SimpleEntity.getMongoIndexes(function (error, indexes) {
          if (error) return done(error)
          const oldIndex = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index1')})
          const newIndex = _.find(indexes, {name: SimpleEntity.getMongoIndexName('anotherIndexedAttribute')})
          expect(oldIndex).to.be.an('object')
          expect(newIndex.key.anotherIndexedAttribute).to.equal(1)
          done()
        })
      })
    })

    describe(`on change les options d'un index`, function () {
      before(function (done) {
        // Plus d'index
        SimpleEntity = entities.define('SimpleEntity')
        SimpleEntity.defineIndex('index1', 'integer', {unique: true})
        SimpleEntity.defineIndex('index2', 'string', {sparse: true, unique: true})
        // On ne flush() pas pour conserver la collection pre-existante
        SimpleEntity._initialize(done)
      })

      it(`supprime l'ancien et crée un nouvel index mongo`, function (done) {
        SimpleEntity.getMongoIndexes(function (error, indexes) {
          if (error) return done(error)
          const oldIndex1 = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index1')})
          const oldIndex2 = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index2')})
          const newIndex1 = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index1-unique')})
          const newIndex2 = _.find(indexes, {name: SimpleEntity.getMongoIndexName('index2-unique-sparse')})
          expect(oldIndex1).to.be.undefined
          expect(oldIndex2).to.be.undefined
          expect(newIndex1).to.be.an('object')
          expect(newIndex2).to.be.an('object')

          done()
        })
      })
    })
  })

  it('créer un index d’un type inconnu throw une erreur', () => {
    const createInvalidIndex = () => SimpleEntity.defineIndex('foo', 'bar')
    expect(createInvalidIndex).to.throw(Error)
  })
})
