/* eslint-env mocha */
'use strict'
const assert = require('assert')
const flow = require('an-flow')
const chai = require('chai')
const {expect} = chai
const sinon = require('sinon')
const sinonChai = require('sinon-chai')

const Entities = require('../source/entities')
const {checkEntity, getTestEntity, setup} = require('./init')

chai.use(sinonChai)

const nbEntities = 1500 // doit être supérieur à la hard limit de lassi
const bt = 1041476706000
const seconde = 1000
const STRING_PREFIX = 'test-'

let TestEntity;
/**
 * Vérifie si l'entité est celle attendue
 *
 * @param {Integer} i      Identifiant de l'entité
 * @param {Object}  entity Entité
 */
function assertEntity (i, entity) {
  assert.equal(entity.i, i)
  assert.equal(entity.s, STRING_PREFIX + i)
  assert.equal(entity.d.getTime(), bt + seconde * i)
  assert.equal(entity.sArray.length, 3)
  assert.equal(entity.iArray.length, 3)
  assert.equal(entity.dArray.length, 3)
}

describe('Test entities-queries', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      setup(this)
    }).seq(function () {
      TestEntity = getTestEntity()
    }).done(done)
  })

  // Normalement déjà testé par entities-indexes, mais ça mange pas de pain de le vérifier de nouveau
  // dans cette entity plus complète
  it('A créé les index demandés', function (done) {
    flow().seq(function () {
      TestEntity.getCollection().listIndexes().toArray(this)
    }).seqEach(function (indexes) {
      // Pour visualiser les index rapidement
      // console.log('index de la collection', indexes)
      expect(indexes).to.have.lengthOf(7)
      this(null, indexes)
    }).seqEach(function (index) {
      expect(index.name).to.match(/^entity_index_/)
      this();
    }).done(done)
  })

  it('Indexe un integer null|undefined comme null, 0 comme 0, false comme 0 - verifie aussi le isNull', function (done) {
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
      TestEntity.match('i').equals(0).sort('oid').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'int zéro')
      assert.equal(entities[1].s, 'int false')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe une string null|undefined comme null - verifie aussi le isNull', function (done) {
    flow().seq(function () {
      TestEntity.create({s: '', i: 42}).store(this)
    }).seq(function () {
      TestEntity.create({s: null, i: 1}).store(this)
    }).seq(function () {
      TestEntity.create({s: undefined, i: 2}).store(this)
    }).seq(function () {
      TestEntity.create({s: 'une string', i: 3}).store(this)
    }).seq(function () {
      TestEntity.match('s').isNull().sort('s', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'date nulle 1')
      assert.equal(entities[1].s, 'date nulle 2')
      TestEntity.match().purge(this)
    }).done(done)
  })
  it('Indexe une date null|undefined comme null - verifie aussi le isNull', function (done) {
    flow().seq(function () {
      TestEntity.create({d: null, s: 'date nulle 1'}).store(this)
    }).seq(function () {
      TestEntity.create({d: undefined, s: 'date nulle 2'}).store(this)
    }).seq(function () {
      TestEntity.create({d: new Date(), s: 'avec date'}).store(this)
    }).seq(function () {
      TestEntity.match('d').isNull().sort('s', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'date nulle 1')
      assert.equal(entities[1].s, 'date nulle 2')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe une date non définie comme null - verifie aussi le isNull', function (done) {
    const createdEntities = []
    flow().seq(function () {
      TestEntity.create({d: null, s: 'date nulle 1'}).store(this)
    }).seq(function (e) {
      createdEntities.push(e)
      TestEntity.create({d: undefined, s: 'date nulle 2'}).store(this)
    }).seq(function (e) {
      createdEntities.push(e)
      TestEntity.create({d: new Date(), s: 'avec date'}).store(this)
    }).seq(function (e) {
      createdEntities.push(e)
      TestEntity.match('d').isNull().sort('s', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, 2)
      assert.equal(entities[0].s, 'date nulle 1')
      assert.equal(entities[1].s, 'date nulle 2')

      this(null, createdEntities)
    }).seqEach(function (entity) {
      entity.delete(this)
    }).done(done)
  })
});

