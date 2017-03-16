/* eslint-env mocha */
'use strict'

var Entities = require('../source/entities');
var entities;
var TestEntity;
var assert = require('assert');
var flow = require('an-flow');

// console.log(process.argv)
// on est lancé par mocha, node est l'arg 0, mocha 1, ce script 2, donc ça démarre à 3
var i = 3

var databaseSettings = {
  name: 'app',
  host : "localhost",
  port: 27017,
  poolSize: 10
}
var a
while (process.argv[i]) {
  a = process.argv[i];
  if (a === '--user') databaseSettings.user = process.argv[i + 1]
  if (a === '--pass') databaseSettings.password = process.argv[i + 1]
  if (a === '--host') databaseSettings.host = process.argv[i + 1]
  if (a === '--name') databaseSettings.name = process.argv[i + 1]
  if (a === '--port') databaseSettings.port = process.argv[i + 1]
  i += 2
}

console.log('lancement avec les paramètres de connexion', databaseSettings)

describe('$entities', function() {
  var count = 2;
  var bt = 1041476706000;
  var MINUTE = 1000*60;

  it('Initialisation des entités', function(done){
    entities = new Entities({database: databaseSettings});
    flow()
    .seq(function() {
      entities.initialize(this);
    })
    .seq(function() {
      TestEntity = entities.define('TestEntity');
      var self = this;
      TestEntity.flush(function() {
        self();
      });
    })
    .done(done);
  });

  it("Initialisation de l'entité de test", function(done) {
    TestEntity.construct(function() {
      this.created = new Date();
      this.i = undefined;
      this.s = undefined;
      this.d = undefined;
      this.p = undefined;
    });
    TestEntity.defineIndex('i', 'integer');
    TestEntity.defineIndex('s', 'string');
    TestEntity.defineIndex('d', 'date');
    TestEntity.defineIndex('p', 'integer', function() {
      return this.i % 2;
    });
    // @todo tester que ce defineIndex fonctionne comme attendu
    TestEntity.defineIndex('q', 'integer', function() {
      if (!(this.d instanceof Date)) return
      var a = this.d.getSeconds() % 2;
      var b = this.d.getSeconds() % 3;
      var c = this.d.getSeconds() % 4;
      return [a, b, c];
    });
    // @todo tester que ce defineIndex fonctionne comme attendu
    TestEntity.defineIndex('r', 'string', function() {
      if (!(this.d instanceof Date)) return
      var a = this.d.getSeconds() % 2;
      var b = this.d.getSeconds() % 3;
      var c = this.d.getSeconds() % 4;
      return ['test'+a, 'test'+b, 'test'+c];
    });
    // @todo tester que ce defineIndex fonctionne comme attendu
    TestEntity.defineIndex('t', 'date', function() {
      if (!(this.d instanceof Date)) return
      var a = new Date(this.d);
      var b = new Date(this.d+3600000);
      var c = new Date(this.d+7200000);
      return [a, b, c];
    });

    entities.initializeEntity(TestEntity, done);
  });

  it("Ajout de "+count+" données dans l'entité", function(done) {
    this.timeout(10000);
    var entities = [];
    for (var i=0; i < count; i++) {
      entities.push(TestEntity.create({
        i: i,
        s: 'truc'+i,
        d: new Date(bt+MINUTE*i)
      }));
    }
    entities.forEach(function(entity, i) {
      assert.equal(entity.i, i);
      assert.equal(entity.s, 'truc'+i);
      assert.equal(entity.d.getTime(), bt+MINUTE*i);
      assert.equal(entity.created.constructor.name, 'Date');
    })
    flow(entities)
    .seqEach(function(entity, i) {
      var next = this;
      entity.store(function(error, entity)  {
        if (error) return next(error);
        assert.equal(entity.i, i);
        assert.equal(entity.s, 'truc'+i);
        assert.equal(entity.d.getTime(), bt+MINUTE*i);
        assert.equal(entity.created.constructor.name, 'Date');
        assert(entity.oid.length==24);
        next();
      });
    })
    .empty().seq(done).catch(done)
  });

  it("Sélection d'entités", function(done) {
    this.timeout(10000);
    flow()
    .seq(function() {
      TestEntity.match('p').equals(0).grab(this);
    })
    .seq(function(entities) {
      assert(entities && entities.length==(count/2));
      entities.forEach(function(entity) {
        var i = entity.i;
        assert.equal(entity.s, 'truc'+i);
        assert.equal(entity.d.getTime(), bt+MINUTE*i);
        assert.equal(entity.created.constructor.name, 'Date');
        assert(entity.oid.length==24);
      })
      this();
    })
    .empty().seq(done).catch(done);
  });

  it("cast automatique au select", function(done) {
    function check (entity) {
      assert.equal(entity.i, data.i);
      assert.equal(entity.s, data.s);
      assert.equal(entity.d, data.d);
    }
    this.timeout(10000);
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
    flow().seq(function() {
      // ajout d'une entité avec les mauvais type
      TestEntity.create(data).store(this)
    }).seq(function(entity) {
      // on vérifie la création qui laisse les datas comme on les a mises
      check(entity)
      // et on test les selects avec les bons types d'index
      TestEntity.match('i').equals(int).grab(this);
    }).seq(function(entity) {
      check(entity)
      TestEntity.match('s').equals(str).grab(this);
    }).seq(function(entity) {
      check(entity)
      TestEntity.match('d').equals(date).grab(this);
    }).seq(function(entity) {
      check(entity)
      // on passe au select avec les mauvais types qui devraient être castés automatiquement
      TestEntity.match('i').equals(str).grab(this);
    }).seq(function(entity) {
      check(entity)
      TestEntity.match('s').equals(int).grab(this);
    }).seq(function(entity) {
      check(entity)
      TestEntity.match('d').equals(date.toString).grab(this);
    }).seq(function(entity) {
      check(entity)
      // on efface cette entité de test pour pas perturber les tests suivants
      entity.delete(this)
    }).empty().seq(done).catch(done);
  });

  it("Suppression d'entités", function(done) {
    flow()
    .callbackWrapper(process.nextTick)
    .seq(function() { TestEntity.match('p').equals(1).grab(this); })
    .seqEach(function(entity) {
      entity.drop(this);
    })
    .done(done);
  });

  it("Vérification des suppressions", function(done) {
    TestEntity.match('p').equals(1).grab(function(error, result) {
      if (error) return done(error);
      assert(result.length===(count/2));
      done();
    });
  });

  it("Vérification des non suppressions", function(done) {
    TestEntity.match('p').equals(0).grab(function(error, result) {
      if (error) return done(error);
      assert(result.length===(count/2));
      done();
    });
  });

  it("Une recherche simple ne donnant rien", function(done) {
    TestEntity.match('p').equals(666).grabOne(function(error, result) {
      if (error) return done(error);
      assert(result===undefined);
      done();
    });
  });

  it("Une recherche multiple ne donnant rien", function(done) {
    TestEntity.match('p').equals(666).grab(function(error, result) {
      if (error) return done(error);
      assert(result.length===0);
      done();
    });
  });

  it('violent (en // nombreux insert puis update puis delete)', function(done) {
    this.timeout(30 * 1000); // 30s
    var count = 1000;
    var objs = [];
    for (var i=0; i < count; i++) {
      objs.push(TestEntity.create({
        i: i,
        s: 'truc'+i,
        d: new Date(new Date().getTime()+1000*i)
      }))
    }
    flow(objs)
    .callbackWrapper(process.nextTick)
    .parEach(function(obj) {
      obj.store(this);
    })
    .parEach(function(obj) {
      obj.i *= 2;
      obj.tag = 'updated';
      obj.store(this);
    })
    .parEach(function(obj) {
      //console.log(obj.i+':'+obj.tag);
      obj.delete(this);
    })
    .seq(function() {
      done();
    })
    .catch(function(error) {
      console.error(error);
    })
  })
});
