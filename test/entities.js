/* eslint-env mocha */
'use strict'
const assert = require('assert')
const flow = require('an-flow')
const MongoClient = require('mongodb').MongoClient

const Entities = require('../source/entities')

// test database access
const defaultDbSettings = {
  name: 'testLassi',
  host : 'localhost',
  port: 27017,
  user: 'mocha',
  password: 'mocha',
  authMechanism: 'DEFAULT',
  authSource: '',
  options: {
    poolSize: 10
  }
}
const dbSettings = defaultDbSettings

// override dbSettings with argv
function overRideSettings () {
  let i = 3
  let a
  while (process.argv[i]) {
    a = process.argv[i]
    if (a === '--name') dbSettings.name = process.argv[i + 1]
    if (a === '--host') dbSettings.host = process.argv[i + 1]
    if (a === '--port') dbSettings.port = process.argv[i + 1]
    if (a === '--user') dbSettings.user = process.argv[i + 1]
    if (a === '--pass') dbSettings.password = process.argv[i + 1]
    if (a === '--ssl-cert') dbSettings.sslCert = process.argv[i + 1]
    if (a === '--ssl-key') dbSettings.sslKey = process.argv[i + 1]
    if (a === '--auth-mechanism') dbSettings.authMechanism = process.argv[i + 1]
    if (a === '--auth-source') dbSettings.authSource = process.argv[i + 1]
    if (a === '--pool-size') dbSettings.poolSize = process.argv[i + 1]
    // et on accepte aussi db pour name
    if (a === '--db') dbSettings.name = process.argv[i + 1]
    i += 2
  }
}

// teste la connexion à mongo (on gère pas certif ssl ni kerberos)
function checkMongoConnexion (next) {
  const {name, host, port, authMechanism} = dbSettings
  let url = 'mongodb://'
  // ssl prioritaire sur user/pass
  if (dbSettings.user && dbSettings.password) {
    url += `${encodeURIComponent(dbSettings.user)}:${encodeURIComponent(dbSettings.password)}@`
  }
  url += `${host}:${port}/${name}?authMechanism=${authMechanism}`
  if (dbSettings.authSource) url += `&authSource=${dbSettings.authSource}`
  const {options} = dbSettings
  MongoClient.connect(url, options, function (error, db) {
    // en cas d'erreur, le process s'arrête avant d'exécuter ça…
    if (error) {
      console.error('La connexion mongoDb a échoué')
      return next(error)
    } else {
      console.log('connexion mongo OK')
    }
    db.close()
    next()
  })
}

// vérif d'une entité
function assertEntity(i, entity) {
  assert.equal(typeof entity.i, 'number')
  assert.equal(entity.d.constructor.name, 'Date')
  assert.equal(typeof entity.s, 'string')
  assert.equal(entity.i, i)
  assert.equal(entity.s, STRING_PREFIX+i)
  assert.equal(entity.d.getTime(), bt+MINUTE*i)
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

// les tests
const count = 1000
const bt = 1041476706000
const MINUTE = 1000*60
const STRING_PREFIX = 'test-'

let entities
let TestEntity

describe('$entities', function () {
  before('checkMongoConnexion', function (done) {
    overRideSettings()
    console.log('lancement avec les paramètres de connexion', dbSettings)
    checkMongoConnexion(done)
  })

  it('Initialisation des entités', function (done) {
    entities = new Entities({database: dbSettings})
    flow().seq(function () {
      entities.initialize(this)
    }).seq(function () {
      TestEntity = entities.define('TestEntity')
      TestEntity.flush(this)
    }).done(done)
  })

  it("Initialisation de l'entité de test", function (done) {
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

    entities.initializeEntity(TestEntity, done)
  })

  it(`Ajout de ${count} données dans l'entité`, function (done) {
    this.timeout(10000)
    const entities = []
    for (let i = 0; i < count; i++) {
      const d = new Date(bt + MINUTE * i)
      entities.push(TestEntity.create({
        i: i,
        s: STRING_PREFIX + i,
        d: d,
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
      const next = this
      entity.store(function (error, entity) {
        if (error) return next(error)
        assertEntity(i, entity)
        next()
      })
    }).done(done)
  })

  it('indexe une date non définie comme null - verifie aussi le isNull', function (done) {
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

  it("déclenche le beforeDelete", function (done) {
    let deleted
    TestEntity.beforeDelete(function (cb) {
      deleted = "oui!"
      cb()
    })
    flow().seq(function () {
      TestEntity.create().store(this)
    }).seq(function (entity) {
      entity.delete(this)
    }).seq(function () {
      assert.equal(deleted, "oui!")
      TestEntity.beforeDelete(function (cb) {cb()})
      this()
    }).done(done)
  })

  it("Sélection d'entités", function (done) {
    this.timeout(10000)
    flow().seq(function () {
      TestEntity.match('iPair').equals(0).grab(this)
    }).seq(function (entities) {
      assert.equal(entities.length, count / 2)
      entities.forEach(entity => assertEntity(entity.i, entity))
      this()
    }).done(done)
  })

  it("Sélection d'entités avec limit", function (done) {
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

  it("Tri d'entités", function (done) {
    flow().seq(function () {
      TestEntity.match().sort('i', 'asc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities[0].i, 0)
      assert.equal(entities[1].i, 1)
      this()
    }).seq(function () {
      TestEntity.match().sort('i', 'desc').grab(this)
    }).seq(function (entities) {
      assert.equal(entities[0].i, count - 1)
      assert.equal(entities[1].i, count - 2)
      this()
    }).done(done)
  })

  it("Compte d'entités", function (done) {
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

  it("double match sur le même attribut", function (done) {
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

  it("Recherche avec like", function (done) {
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

  it("Suppression de la moitié des entités", function (done) {
    flow()
      .callbackWrapper(process.nextTick)
      .seq(function () {
        TestEntity.match('iPair').equals(1).grab(this);
      }).seq(function (entities) {
      assert.equal(entities.length, count / 2)
      this(null, entities)
    }).seqEach(function (entity) {
      entity.delete(this)
    }).done(done)
  })

  it("Suppression 'douce' d'une entité", function (done) {
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
      // new Date(started.getYear(), started.getMonth(), started.getDay() + 1)
      TestEntity.match().deletedBefore(new Date()).grabOne(this)
      // si on met du strict dans deletedBefore, ce test passe pas, même en prenant une date lointaine…
      // const dateFuture = new Date(Date.now() + 1000 * 3600 * 24 * 366)
      // console.log(entity.__deletedAt)
      // console.log(dateFuture)
      // TestEntity.match().deletedBefore(dateFuture).grabOne(this)
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

  it("Vérification des suppressions", function (done) {
    TestEntity.match('iPair').equals(1).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 0)
      done()
    })
  })

  it("Vérification des non suppressions", function (done) {
    TestEntity.match('iPair').equals(0).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, count / 2)
      done()
    })
  })

  it("Une recherche simple ne donnant rien", function (done) {
    TestEntity.match('iPair').equals(666).grabOne(function (error, result) {
      if (error) return done(error)
      assert(result === undefined)
      done()
    })
  })

  it("Une recherche multiple ne donnant rien", function (done) {
    TestEntity.match('iPair').equals(666).grab(function (error, result) {
      if (error) return done(error)
      assert(result.length === 0)
      done()
    })
  })

  it("= string", function (done) {
    TestEntity.match('s').equals(STRING_PREFIX + '198').grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 1)
      done()
    })
  })
  it("in string", function (done) {
    TestEntity.match('s').in([STRING_PREFIX + '198', STRING_PREFIX + '196']).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 2)
      done()
    })
  })
  it("not in string", function (done) {
    TestEntity.match('s').notIn([STRING_PREFIX + '198', STRING_PREFIX + '196']).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 498)
      done()
    })
  })
  it("in and not in string", function (done) {
    // ce test vérifie aussi qu'on peut appeler plusieurs matcher sur un même champ
    TestEntity
      .match('s').notIn([STRING_PREFIX + '200', STRING_PREFIX + '198'])
      .match('s').in([STRING_PREFIX + '200', STRING_PREFIX + '198', STRING_PREFIX + '196'])
      .grab(function (error, result) {
        if (error) return done(error)
        assert.equal(result.length, 1)
        assert.equal(result[0].s, STRING_PREFIX + '196')
        done()
      })
  })
  it("in string[]", function (done) {
    TestEntity.match('sArray').in([STRING_PREFIX + '199', STRING_PREFIX + '196']).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 1)
      done()
    })
  })
  let oid
  it("> date[]", function (done) {
    const d = new Date('2003-01-02T04:11:00.000Z')
    TestEntity.match('dArray').after(d).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 467)
      oid = result[0].oid
      done()
    })
  })

  it("= oid", function (done) {
    TestEntity.match('oid').equals(oid).grab(function (error, result) {
      if (error) return done(error)
      assert.equal(result.length, 1)
      done()
    })
  })

  it("ménage pour la suite", function (done) {
    flow().seq(function () {
      TestEntity.match().grab(this)
    }).seqEach(function (entity) {
      entity.delete(this)
    }).done(done)
  })

  it("cast automatique au select", function (done) {
    function check (entity) {
      assert.equal(entity.i, data.i)
      assert.equal(entity.s, data.s)
      assert.equal(entity.d, data.d)
      assert.equal(typeof entity.i, 'string')
      assert.equal(typeof entity.s, 'number')
      assert.equal(typeof entity.d, 'string')
    }

    this.timeout(10000)
    const int = 42
    const str = String(int)
    const timestamp = bt + MINUTE * int
    const date = new Date(timestamp)
    // on crée un objet avec des propriétés de type différents des index
    const data = {
      i: str,
      s: int,
      d: date.toString()
    }

    flow().seq(function () {
      // ajout d'une entité avec les mauvais type
      TestEntity.create(data).store(this)
    }).seq(function (entity) {
      // on vérifie la création qui laisse les datas comme on les a mises
      check(entity)
      // et on test les selects avec les bons types d'index
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

  it('violent (en // nombreux insert puis update puis delete)', function (done) {
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
