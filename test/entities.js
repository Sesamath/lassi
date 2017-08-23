/* eslint-env mocha */
'use strict'

const assert = require('assert')
const assertEntity = require('./index.js').assertEntity
const constants = require('./constants.js')
const flow = require('an-flow')
const Entities = require('../source/entities')
const checkMongoConnexion = require('./index.js').checkMongoConnexion
const dbSettings = require('./index.js').dbSettings

const nbEntities = 1500 // doit être supérieur à la hard limit de lassi

let entities
let TestEntity

/**
 * Ajout des données aux entités
 *
 * @param {Callback} next
 */
function addData (next) {
  const entities = []
  for (let i = 0; i < nbEntities; i++) {
    const d = new Date(constants.BT + constants.MINUTE * i)
    entities.push(TestEntity.create({
      i: i,
      s: constants.STRING_PREFIX + i,
      d: d,
      iArray: [
        i * 3,
        i * 3 + 1,
        i * 3 + 2
      ],
      sArray: [
        constants.STRING_PREFIX + (i * 3),
        constants.STRING_PREFIX + (i * 3 + 1),
        constants.STRING_PREFIX + (i * 3 + 2)
      ],
      dArray: [
        new Date(d),
        new Date(d + 3600000),
        new Date(d + 7200000)
      ]
    }))
  }
  entities.forEach(function (entity, i) {
    assertEntity(i, entity)
  })
  flow(entities).seqEach(function (entity, i) {
    const nextSeq = this
    entity.store(function (error, entity) {
      if (error) return nextSeq(error)
      assertEntity(i, entity)
      nextSeq()
    })
  }).done(next)
}

/**
 * Initialisation des entités
 *
 * @param {Callback} next
 */
function initEntities(next) {
  entities = new Entities({database: dbSettings})
  flow().seq(function() {
    entities.initialize(this)
  }).seq(function() {
    TestEntity = entities.define('TestEntity')
    TestEntity.flush(this)
  }).seq(function () {
    TestEntity.construct(function () {
      this.created = new Date()
      this.i = undefined
      this.s = undefined
      this.d = undefined
    })
    TestEntity.defineIndex('i', 'integer')
    TestEntity.defineIndex('s', 'string')
    TestEntity.defineIndex('d', 'date')
    TestEntity.defineIndex('iPair', 'integer', function () {
      return this.i % 2
    })
    TestEntity.defineIndex('iArray', 'integer')
    TestEntity.defineIndex('sArray', 'string')
    TestEntity.defineIndex('dArray', 'date')

    TestEntity.defineIndex('type', 'string')
    TestEntity.defineIndex('text1', 'string')
    TestEntity.defineIndex('text2', 'string')
    TestEntity.defineTextSearchFields(['text1', 'text2'])

    entities.initializeEntity(TestEntity, this)
  }).seq(function () {
    addData(this)
  }).done(next)
}

describe('$entities', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      checkMongoConnexion(this)
    }).seq(function () {
      initEntities(this)
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

  describe('.beforeDelete()', function () {
    it('Déclenche le beforeDelete', function (done) {
      let deleted
      TestEntity.beforeDelete(function (cb) {
        deleted = 'oui!'
        cb()
      })
      flow().seq(function () {
        TestEntity.create().store(this)
      }).seq(function (entity) {
        entity.delete(this)
      }).seq(function () {
        assert.equal(deleted, 'oui!')
        TestEntity.beforeDelete(function (cb) {cb()})
        this()
      }).done(done)
    })
  })

  describe('.match()', function () {
    let oid
    it(`Recherche avec l'opérateur AFTER pour un tableau de dates`, function (done) {
      const d = new Date('2003-01-02T15:26:00.000Z')
      TestEntity.match('dArray').after(d).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 759)
        oid = result[0].oid
        done()
      })
    })

    it(`Recherche exacte sur l'oid`, function (done) {
      TestEntity.match('oid').equals(oid).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        done()
      })
    })

    it('Recherche exacte sur une string', function (done) {
      TestEntity.match('s').equals(constants.STRING_PREFIX + '198').grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        done()
      })
    })

    it(`Recherche avec l'opérateur IN pour une string`, function (done) {
      TestEntity.match('s').in([constants.STRING_PREFIX + '198', constants.STRING_PREFIX + '196']).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 2)
        done()
      })
    })

    it(`Recherche avec l'opérateur NOT IN pour une string`, function (done) {
      let notInArray = []
      for (let i = 0; i < nbEntities / 2; i++) {
        notInArray.push(constants.STRING_PREFIX + i)
      }
      TestEntity.match('s').notIn(notInArray).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 750)
        done()
      })
    })

    it('Double match sur le même attribut', function (done) {
      flow().seq(function () {
        // Si les matchs sont compatibles, ils "s'ajoutent"
        TestEntity
          .match('i').greaterThanOrEquals(5)
          .match('i').lowerThanOrEquals(9)
          .count(this)
      }).seq(function (count) {
        assert.equal(count, 5)
        this()
      }).seq(function () {
        // On teste une combinaison impossible
        TestEntity
          .match('s').like("test-4")
          .match('i').equals(5)
          .grab(this)
      }).seq(function (entities) {
        assert.equal(entities.length, 0)
        this()
      }).seq(function () {
        // On teste un "écrasement"
        TestEntity
          .match('i').equals(4)
          .match('i').equals(5)
          .grab(this)
      }).seq(function (entities) {
        assert.equal(entities.length, 1)
        assert.equal(entities[0].i, 5)
        this()
      }).done(done)
    })

    it(`Double match sur le même attribut avec les opérateurs IN et NOT IN pour une string`, function (done) {
      TestEntity
        .match('s').in([constants.STRING_PREFIX + '200', constants.STRING_PREFIX + '198', constants.STRING_PREFIX + '196'])
        .match('s').notIn([constants.STRING_PREFIX + '200', constants.STRING_PREFIX + '198'])
        .grab((error, result) => {
          if (error) return done(error)
          assert.equal(result.length, 1)
          assert.equal(result[0].s, constants.STRING_PREFIX + '196')
          done()
        })
    })

    it(`Recherche avec l'opérateur IN pour un tableau de string`, function (done) {
      TestEntity.match('sArray').in([constants.STRING_PREFIX + '199', constants.STRING_PREFIX + '196']).grab(function (error, result)  {
        if (error) return done(error)
        assert.equal(result.length, 2)
        done()
      })
    })
  })

  describe('.grab()', function () {
    it(`Sélection d'entités`, function (done) {
      this.timeout(10000)
      flow().seq(function () {
        TestEntity.match('iPair').equals(0).grab(this)
      }).seq(function (entities) {
        assert.equal(entities.length, nbEntities / 2)
        entities.forEach(entity => assertEntity(entity.i, entity))
        this()
      }).done(done)
    })

    it(`Sélection d'entités avec limit`, function (done) {
      this.timeout(10000)
      flow().seq(function () {
        TestEntity.match().grab({offset: 100, limit: 100}, this)
      }).seq(function (entities) {
        assert.equal(entities.length, 100)
        entities.forEach(function (entity, i) {
          assertEntity(100 + i, entity)
        })
        this()
      }).done(done)
    })

    it(`Sélection d'entités avec hard limit`, function (done) {
      this.timeout(10000)
      flow().seq(function () {
        TestEntity.match().grab(this)
      }).seq(function (entities) {
        assert.equal(entities.length, 1000)
        entities.forEach(function (entity, i) {
          assertEntity(i, entity)
        })
        this()
      }).seq(function () {
        TestEntity.match().grab({limit: 1200}, this)
      }).seq(function (entities) {
        assert.equal(entities.length, 1000)
        entities.forEach(function (entity, i) {
          assertEntity(i, entity)
        })
        this()
      }).done(done)
    })

    it('Recherche simple ne donnant rien', function (done) {
      TestEntity.match('iPair').equals(666).grabOne(function (error, result) {
        if (error) return done(error)
        assert(result === undefined)
        done()
      })
    })

    it('Recherche multiple ne donnant rien', function (done) {
      TestEntity.match('iPair').equals(666).grab(function (error, result) {
        if (error) return done(error)
        assert(result.length === 0)
        done()
      })
    })
  })

  describe('.sort()', function () {
    it(`Tri d'entités`, function (done) {
      flow().seq(function () {
        TestEntity.match().sort('i', 'asc').grab(this)
      }).seq(function (entities) {
        assert.equal(entities[0].i, 0)
        assert.equal(entities[1].i, 1)
        this()
      }).seq(function () {
        TestEntity.match().sort('i', 'desc').grab(this)
      }).seq(function (entities) {
        assert.equal(entities[0].i, nbEntities - 1)
        assert.equal(entities[1].i, nbEntities - 2)
        this()
      }).done(done)
    })
  })

  describe('.count()', function () {
    it(`Compte d'entités`, function (done) {
      flow().seq(function () {
        TestEntity.match('i').equals(1).count(this)
      }).seq(function (count) {
        assert.equal(count, 1)
        this()
      }).seq(function () {
        // Test avec un matcher plus complexe
        TestEntity.match('i').lowerThanOrEquals(9).count(this)
      }).seq(function (count) {
        assert.equal(count, 10)
        this()
      }).done(done)
    })
  })

  describe('.like()', function () {
    it('Recherche avec like', function (done) {
      let texteOriginal
      flow().seq(function () {
        TestEntity.match().grabOne(this)
      }).seq(function (entity) {
        texteOriginal = entity.s
        entity.s = 'texte à chercher'
        entity.store(this)
      }).seq(function () {
        TestEntity.match('s').like('%cherche%').grab(this)
      }).seq(function (resultats) {
        assert.equal(resultats.length, 1)
        assert.equal(resultats[0].s, 'texte à chercher')
        resultats[0].s = texteOriginal
        resultats[0].store(this)
      }).done(done)
    })
  })

  describe('.softDelete()', function () {
    it(`Suppression 'douce' d'une entité`, function (done) {
      let oid = null
      const started = new Date()
      flow().seq(function () {
        TestEntity.create({d: null}).store(this)
      }).seq(function (entity) {
        oid = entity.oid
        entity.softDelete(this)
      }).seq(function () {
        TestEntity.match('oid').equals(oid).grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity, undefined)
        TestEntity
          .match('__deletedAt').lowerThanOrEquals(new Date())
          .onlyDeleted()
          .grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity.oid, oid)
        TestEntity.match().deletedAfter(started).grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity.oid, oid)
        TestEntity.match().deletedAfter(new Date()).grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity, undefined)
        TestEntity.match().deletedBefore(new Date()).grabOne(this)
        // si on met du strict dans deletedBefore, ce test passe pas, même en prenant une date lointaine…
      }).seq(function (entity) {
        assert.equal(entity.oid, oid)
        TestEntity.match().deletedBefore(started).grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity, undefined)
        TestEntity.match('oid').equals(oid).onlyDeleted().grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity.oid, oid)
        entity.restore(this)
      }).seq(function () {
        TestEntity.match('oid').equals(oid).grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity.oid, oid)
        entity.delete(this)
      }).seq(function () {
        TestEntity.match('oid').equals(oid).grabOne(this)
      }).seq(function (entity) {
        assert.equal(entity, undefined)
        this()
      }).done(done)
    })
  })

  describe('.delete()', function () {
    it('Suppression de la moitié des entités', function (done) {
      flow()
        .callbackWrapper(process.nextTick)
        .seq(function () {
          TestEntity.match('iPair').equals(1).grab(this);
        }).seq(function (entities) {
        assert.equal(entities.length, nbEntities / 2)
        this(null, entities)
      }).seqEach(function (entity) {
        entity.delete(this)
      }).done(done)
    })

    it('Vérification des suppressions', function (done) {
      TestEntity.match('iPair').equals(1).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 0)
        done()
      })
    })

    it('Vérification des non suppressions', function (done) {
      TestEntity.match('iPair').equals(0).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, nbEntities / 2)
        done()
      })
    })
  })

  describe('Nombreuses manipulations de données', function () {
    before(function (done) {
      flow().seq(function () {
        TestEntity.match().grab(this)
      }).seqEach(function (entity) {
        entity.delete(this)
      }).done(done)
    })

    it('Cast automatique au select', function (done) {
      this.timeout(10000)
      const int = 42
      const str = String(int)
      const timestamp = constants.BT + constants.MINUTE * int
      const date = new Date(timestamp)
      // on crée un objet avec des propriétés de type différents des index
      const data = {
        i: str,
        s: int,
        d: date.toString()
      }

      function check (entity) {
        assert.equal(entity.i, data.i)
        assert.equal(entity.s, data.s)
        assert.equal(entity.d, data.d)
        assert.equal(typeof entity.i, 'string')
        assert.equal(typeof entity.s, 'number')
        assert.equal(typeof entity.d, 'string')
      }

      flow().seq(function () {
        // Ajout d'une entité avec les mauvais types
        TestEntity.create(data).store(this)
      }).seq(function (entity) {
        // On vérifie la création qui laisse les datas comme on les a mises
        check(entity)
        // On teste les selects avec les bons types d'index
        TestEntity.match('i').equals(int).grabOne(this)
      }).seq(function (entity) {
        check(entity)
        TestEntity.match('s').equals(str).grabOne(this)
      }).seq(function (entity) {
        check(entity)
        TestEntity.match('d').equals(date).grabOne(this)
      }).seq(function (entity) {
        check(entity)
        // on passe au select avec les mauvais types qui devraient être castés automatiquement
        TestEntity.match('i').equals(str).grabOne(this)
      }).seq(function (entity) {
        check(entity)
        TestEntity.match('s').equals(int).grabOne(this)
      }).seq(function (entity) {
        check(entity)
        TestEntity.match('d').equals(date.toString()).grabOne(this)
      }).seq(function (entity) {
        check(entity)
        // on efface cette entité de test pour pas perturber les tests suivants
        entity.delete(this)
      }).done(done)
    })

    it('Insert, update et delete en parallèle', function (done) {
      this.timeout(30 * 1000); // 30s
      const count = 10000
      const objs = []
      for (let i = 0; i < count; i++) {
        objs.push(TestEntity.create({
          i: i,
          s: constants.STRING_PREFIX + i,
          d: new Date(new Date().getTime() + 1000 * i)
        }))
      }

      flow(objs)
        .callbackWrapper(process.nextTick)
        .parEach(function (obj) {
          obj.store(this)
        }).parEach(function (obj) {
        obj.i *= 2
        obj.tag = 'updated'
        obj.store(this)
      }).seqEach(function (obj) {
        obj.delete(this)
      }).seq(function () {
        done();
      }).catch(console.error)
    })
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
        // 42004 arrive premier car il a un "foo bar" exact
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
        // 42004 arrive premier car il a un "foo bar" exact
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
        // 42001 arrive second car on a trié par type en ordre décroissant
        assert.equal(results[1].i, 42000);
        assert.equal(results[2].i, 42003);
        done();
      })
    })
  });
});
