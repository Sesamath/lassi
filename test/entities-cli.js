/* eslint-env mocha */
'use strict'

const assert = require('assert')
const expect = require('chai').expect
const flow = require('an-flow')
const moment = require('moment')
const EntitiesCli = require('../source/services/entities-cli')()
const {checkEntity, quit, setup} = require('./init')

let TestEntity

/**
 * Vérifie si l'entité est celle attendue
 *
 * @param {Integer} i      Identifiant de l'entité
 * @param {Object}  entity Entité
 */
function assertEntity (i, entity) {
  checkEntity(entity)
  assert.equal(entity.i, i)
}

/**
 * Ajoute 3 entités softDeleted
 *
 * @param {Callback} next
 */
function addData (next) {
  const entities = [
    { i: 1000, __deletedAt: moment().subtract(5, 'days').toDate() },
    { i: 1001, __deletedAt: moment().subtract(10, 'days').toDate() },
    { i: 1002, __deletedAt: moment().subtract(15, 'days').toDate() },
  ];
  flow(entities)
  .seqEach(function (entity) {
    const nextSeq = this;
    TestEntity.create(entity).store(function (error, entity) {
      if (error) return nextSeq(error)
      nextSeq()
    });
  }).done(next);
}

describe('Test $entities-cli', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity) {
      TestEntity = Entity
      addData(this)
    }).done(done)
  })

  after('ferme la connexion', quit)

  describe('.purge()', function () {
    it('Vérification des erreurs', function () {
      const wrongArguments = function () { EntitiesCli.commands().purge(TestEntity, this); }
      expect(wrongArguments).to.throw(Error); // Nombre d'arguments incorrects
      const noCallback = function () { EntitiesCli.commands().purge(TestEntity, 13, 'string'); }
      expect(noCallback).to.throw(Error); // Dernier paramètre n'est pas un callback
      const notNumber = function () { EntitiesCli.commands().purge(TestEntity, 'string', this); }
      expect(notNumber).to.throw(Error); // Deuxième argument n'est pas un nombre
      const negativeNumber = function () { EntitiesCli.commands().purge(TestEntity, -5, this); }
      expect(negativeNumber).to.throw(Error); // Deuxième argument n'est pas un nombre positif
      const noEntity = function () { EntitiesCli.commands().purge('NotFoundEntity', 13, this); }
      expect(noEntity).to.throw(Error); // Aucune entité n'est récupérée
      const wrongFirstArgument = function () { EntitiesCli.commands().purge(5, 13, this); }
      expect(wrongFirstArgument).to.throw(Error); // Premier argument incorrect
    });

    it('Purge une entité', function (done) {
      flow().seq(function () {
        TestEntity.match().onlyDeleted().count(this)
      }).seq(function (count) {
        assert.equal(count, 3)
        EntitiesCli.commands().purge(TestEntity, 13, this)
      }).seq(function () {
        TestEntity.match().onlyDeleted().sort('i', 'asc').grab(this)
      }).seq(function (entities) {
        assert.equal(entities.length, 2)
        assert.equal(entities[0].i, 1000)
        assert.equal(entities[1].i, 1001)
        this()
      }).done(done)
    })
  })
});
