/* eslint-env mocha */
'use strict'

const assert = require('assert')
const flow = require('an-flow')

const Entities = require('../source/entities')
const init = require('./init')

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
  assert.equal(typeof entity.i, 'number')
  assert.equal(entity.d.constructor.name, 'Date')
  assert.equal(typeof entity.s, 'string')
  assert.equal(entity.i, i)
  assert.equal(entity.s, STRING_PREFIX + i)
  assert.equal(entity.d.getTime(), bt + seconde * i)
  assert(Array.isArray(entity.sArray))
  assert(Array.isArray(entity.iArray))
  assert(Array.isArray(entity.dArray))
  assert.equal(entity.sArray.length, 3)
  assert.equal(entity.iArray.length, 3)
  assert.equal(entity.dArray.length, 3)
  assert.equal(typeof entity.iArray[0], 'number')
  assert.equal(typeof entity.sArray[0], 'string')
  assert.equal(entity.dArray[0].constructor.name, 'Date')
  assert.equal(entity.created.constructor.name, 'Date')
  if (entity.oid) assert.equal(entity.oid.length, 24)
}

/**
 * Ajout des données aux entités
 *
 * @param {Callback} next
 */
function addData (next) {
  const entities = []
  for (let i = 0; i < nbEntities; i++) {
    const dTimeStamp = bt + seconde * i
    entities.push(TestEntity.create({
      i: i,
      s: STRING_PREFIX + i,
      d: new Date(dTimeStamp),
      iArray: [
        i * 3,
        i * 3 + 1,
        i * 3 + 2
      ],
      sArray: [
        STRING_PREFIX + (i * 3),
        STRING_PREFIX + (i * 3 + 1),
        STRING_PREFIX + (i * 3 + 2)
      ],
      dArray: [
        new Date(dTimeStamp),
        new Date(dTimeStamp + 100), // < 1000 car sinon ça ca chevaucher avec le suivant...
        new Date(dTimeStamp + 200)
      ]
    }))
  }

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
function initEntities(dbSettings, next) {
  const entities = new Entities({database: dbSettings})
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

    entities.initializeEntity(TestEntity, this)
  }).done(next)
};

describe('Test entities-queries', function () {
  let dbSettings;

  before('Connexion à Mongo et initialisation des entités', function (done) {
    flow().seq(function () {
      init(this)
    }).seq(function (dbSettings) {
      initEntities(dbSettings, this)
    }).seq( function () {
      addData(this)
    }).done(done)
  })

  // @todo: à enlever quand on sera confiant dans notre gestion des index (normalement bien couvert par entities-indexes)
  it('A créé les index demandés', function (done) {
    const db = TestEntity.getDb()
    flow().seq(function () {
      TestEntity.getCollection().listIndexes().toArray(this)
    }).seq(function (indexes) {
      // Pour visualiser les index rapidement
      // console.log('indexes de la collection', indexes)
      this();
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
    it(`jette une exception si le champ n'est pas indexé`, function () {
      assert.throws(function() {
        TestEntity.match('nonIndexed').equals(1).grab(function (error, result) {
          // devrait throw avant d'arriver là
        })
      })
    })
    let oid
    it(`Recherche avec l'opérateur AFTER sur une date`, function (done) {
      const d = new Date(bt + seconde * (nbEntities - 760))
      TestEntity.match('d').after(d).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 759)
        oid = result[0].oid
        done()
      })
    })

    it(`Recherche avec l'opérateur AFTER pour un tableau de dates`, function (done) {
      const d = new Date(bt + seconde * (nbEntities - 760))
      TestEntity.match('dArray').after(d).grab(function (error, result) {
        if (error) return done(error)
        // cas intéressant, on a un résultat en plus car l'entité dont entity.d === d
        // a aussi une valeur dans son dArray qui est "after" d.
        assert.equal(result.length, 760)
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
      TestEntity.match('s').equals(STRING_PREFIX + '198').grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].i, 198)
        done()
      })
    })

    it('Recherche exacte sur un entier', function (done) {
      TestEntity.match('i').equals(198).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].i, 198)
        done()
      })
    })

    it('Recherche exacte sur une date', function (done) {
      TestEntity.match('d').equals(new Date(bt + seconde * 198)).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].i, 198)
        done()
      })
    })

    it(`Recherche exacte sur une element d'un tableau de string`, function (done) {
      TestEntity.match('sArray').equals(STRING_PREFIX + (198 * 3 + 1)).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].i, 198)
        done()
      })
    })

    it(`Recherche exacte sur un element d'un tableau d’entiers`, function (done) {
      TestEntity.match('iArray').equals(198 * 3 + 1).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].i, 198)
        done()
      })
    })

    it(`Recherche exacte sur un element d'un tableau de dates`, function (done) {
      TestEntity.match('dArray').equals(new Date((bt + seconde * 198) + 100)).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].i, 198)
        done()
      })
    })

    it(`Recherche avec l'opérateur IN pour une string`, function (done) {
      TestEntity.match('s').in([STRING_PREFIX + '198', STRING_PREFIX + '196']).grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 2)
        done()
      })
    })

    it(`Recherche avec l'opérateur NOT IN pour une string`, function (done) {
      let notInArray = []
      for (let i = 0; i < nbEntities / 2; i++) {
        notInArray.push(STRING_PREFIX + i)
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
        .match('s').in([STRING_PREFIX + '200', STRING_PREFIX + '198', STRING_PREFIX + '196'])
        .match('s').notIn([STRING_PREFIX + '200', STRING_PREFIX + '198'])
        .grab((error, result) => {
          if (error) return done(error)
          assert.equal(result.length, 1)
          assert.equal(result[0].s, STRING_PREFIX + '196')
          done()
        })
    })

    it(`Recherche avec l'opérateur IN pour un tableau de string`, function (done) {
      TestEntity.match('sArray').in([STRING_PREFIX + '199', STRING_PREFIX + '196']).grab(function (error, result)  {
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
  describe(`Suppression "douce" d'une entité()`, function() {
    var createdEntities
    var deletedEntity
    var nonDeletedEntity
    var started

    beforeEach(function(done) {
      started = new Date()

      var entities = [
        { i: 42000 }, // <-- celle là sera soft-deleted
        { i: 42001 },
      ]

      flow(entities)
      .seqEach(function(entity) {
        TestEntity.create(entity).store(this);
      })
      .seq(function(instances) {
        createdEntities = instances;
        nonDeletedEntity = createdEntities[1];
        createdEntities[0].softDelete(this)
      })
      .seq(function(_deletedEntity) {
        deletedEntity = _deletedEntity;
        done();
      })
      .catch(done)
    })

    afterEach(function(done) {
      // Cleanup
      flow(createdEntities)
      .seqEach(function(entity) {
        entity.delete(this);
      })
      .done(done)
    })

    describe('Deleted entity', function() {
      it('Renvoie true pour isDeleted()', function() {
        assert.equal(deletedEntity.isDeleted(), true)
      })
      it(`N'apparaît plus dans le grab par defaut`, function(done) {
        flow()
        .seq(function() {
          TestEntity.match('oid').equals(deletedEntity.oid).grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity, undefined);
          this();
        })
        .done(done)
      })
      it('Apparaît avec onlyDeleted()', function(done) {
        flow()
        .seq(function() {
          TestEntity.match('oid').equals(deletedEntity.oid).onlyDeleted().grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.oid, deletedEntity.oid);
          this();
        })
        .done(done)
      })
      it('Apparaît avec includeDeleted()', function(done) {
        flow()
        .seq(function() {
          TestEntity.match('oid').equals(deletedEntity.oid).includeDeleted().grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.oid, deletedEntity.oid);
          this();
        })
        .done(done)
      })
      it('Peut être trouvée par deletedAfter()', function(done) {
        flow()
        .seq(function() {
          TestEntity.match().deletedAfter(started).grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.oid, deletedEntity.oid);
          TestEntity.match().deletedAfter(Date.now()).grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity, undefined);
          this();
        })
        .done(done)
      })
      it('Peut être trouvée par deletedBefore()', function(done) {
        flow()
        .seq(function() {
          TestEntity.match().deletedBefore(new Date(Date.now() + 1000)).grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.oid, deletedEntity.oid);
          TestEntity.match().deletedBefore(started).grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity, undefined);
          this();
        })
        .done(done)
      })
      it('Peut être restaurée', function(done) {
        flow()
        .seq(function() {
          deletedEntity.restore(this);
        })
        .seq(function() {
          // On vérifie la mise à jour en bdd
          TestEntity.match('oid').equals(deletedEntity.oid).grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.isDeleted(), false);
          assert.equal(entity.oid, deletedEntity.oid);
          this();
        })
        .done(done)
      })
      it('Peut être store', function(done) {
        flow()
        .seq(function() {
          deletedEntity.store(this);
        })
        .seq(function(entity) {
          // Elle doit toujours etre "deleted"
          assert.equal(entity.isDeleted(), true);
          // On vérifie en bdd
          TestEntity.match('oid').equals(deletedEntity.oid).onlyDeleted().grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.isDeleted(), true);
          assert.equal(entity.oid, deletedEntity.oid);
          this();
        })
        .done(done)
      })
    })

    describe('Non-deleted entity', function() {
      it('Renvoie false pour isDeleted()', function() {
        assert.equal(nonDeletedEntity.isDeleted(), false)
      })
      it(`N'apparaît pas avec onlyDeleted()`, function(done) {
        flow()
        .seq(function() {
          TestEntity.match('oid').equals(nonDeletedEntity.oid).onlyDeleted().grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity, undefined);
          this();
        })
        .done(done)
      })
      it('Apparaît avec includeDeleted()', function(done) {
        flow()
        .seq(function() {
          TestEntity.match('oid').equals(nonDeletedEntity.oid).includeDeleted().grabOne(this)
        })
        .seq(function(entity) {
          assert.equal(entity.oid, nonDeletedEntity.oid);
          this();
        })
        .done(done)
      })
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
      const timestamp = bt + seconde * int
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
          s: STRING_PREFIX + i,
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

  describe('.purge()', function () {
    before(function (done) {
      const entities = [];
      for (let i = 0; i < nbEntities; i++) {
        entities.push({
          i: i,
          s: STRING_PREFIX + i,
        });
      }
      flow(entities)
      .seqEach(function (entity) {
        TestEntity.create(entity).store(this);
      })
      .done(done);
    })

    it('Purge des entités', function (done) {
      flow().seq(function () {
        TestEntity.match().count(this);
      }).seq(function (nb) {
        assert.equal(nb, nbEntities);
        TestEntity.match('i').lowerThan(8).purge(this);
      }).seq(function (nbDeleted) {
        assert.equal(nbDeleted, 8);
        TestEntity.match('s').equals(STRING_PREFIX + 42).purge(this);
      }).seq(function (nbDeleted) {
        assert.equal(nbDeleted, 1);
        TestEntity.match('i').lowerThan(45).match('i').greaterThan(40).purge(this);
      }).seq(function (nbDeleted) {
        assert.equal(nbDeleted, 3); // 41, 43, 44
        TestEntity.match().purge(this);
      }).seq(function (nbDeleted) {
        assert.equal(nbDeleted, nbEntities - 12);
        TestEntity.match().count(this);
      }).seq(function (count) {
        assert.equal(count, 0);
        this();
      }).done(done)
    })
  })
});

