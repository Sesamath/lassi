/* eslint-env mocha */
'use strict'

const {expect} = require('chai')
const flow = require('an-flow')
const moment = require('moment')
const EntitiesCli = require('../source/services/entities-cli')()
const {quit, setup} = require('./init')

let TestEntity

/**
 * Ajoute 3 entités softDeleted
 *
 * @param {Callback} next
 */
function addData (next) {
  const datas = [
    { i: 1000, __deletedAt: moment().subtract(5, 'days').toDate() },
    { i: 1001, __deletedAt: moment().subtract(10, 'days').toDate() },
    { i: 1002, __deletedAt: moment().subtract(15, 'days').toDate() }
  ]
  flow(datas).seqEach(function (data) {
    TestEntity.create(data).store(this)
  }).empty().done(next)
}

describe('Test $entities-cli', function () {
  this.timeout(20000) // circleCI peut être un peu lent à l'init

  before('Connexion à Mongo et initialisation des entités', (done) => {
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity) {
      TestEntity = Entity
      addData(this)
    }).done(done)
  })

  after('nettoie en sortant', quit)

  describe('.purgeDeleted()', () => {
    it('Throw Error en cas d’usage incorrect', () => {
      const wrongArguments = () => EntitiesCli.commands().purgeDeleted(TestEntity, this)
      expect(wrongArguments).to.throw(Error) // Nombre d'arguments incorrects
      const noCallback = () => EntitiesCli.commands().purgeDeleted(TestEntity, 13, 'string')
      expect(noCallback).to.throw(Error) // Dernier paramètre n'est pas un callback
      const notNumber = () => EntitiesCli.commands().purgeDeleted(TestEntity, 'string', this)
      expect(notNumber).to.throw(Error) // Deuxième argument n'est pas un nombre
      const negativeNumber = () => EntitiesCli.commands().purgeDeleted(TestEntity, -5, this)
      expect(negativeNumber).to.throw(Error) // Deuxième argument n'est pas un nombre positif
      const noEntity = () => EntitiesCli.commands().purgeDeleted('NotFoundEntity', 13, this)
      expect(noEntity).to.throw(Error) // Pas une Entity passée en 1er argument (string)
      const wrongFirstArgument = () => EntitiesCli.commands().purgeDeleted(5, 13, this)
      expect(wrongFirstArgument).to.throw(Error) // Pas une Entity passée en 1er argument (number)
    })

    it('Purge une entité', (done) => {
      flow().seq(function () {
        TestEntity.match().onlyDeleted().count(this)
      }).seq(function (count) {
        expect(count).to.equal(3)
        EntitiesCli.commands().purgeDeleted(TestEntity, 13, this)
      }).seq(function () {
        TestEntity.match().onlyDeleted().sort('i', 'asc').grab(this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(2)
        expect(entities[0].i).to.equal(1000)
        expect(entities[1].i).to.equal(1001)
        this()
      }).done(done)
    })
  })
})
