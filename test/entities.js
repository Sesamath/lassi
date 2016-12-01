/* eslint-env mocha */
'use strict'

var Entities = require('../source/entities');
var entities;
var TestEntity;
var assert = require('assert');
var flow = require('an-flow');
// valeurs par défaut
var dbUser = 'root'
var dbPass = 'app'
var dbHost = 'localhost'
var db = 'app'

// console.log(process.argv)
// on est lancé par mocha, node est l'arg 0, mocha 1, ce script 2, donc ça démarre à 3
var i = 3
var a
while (process.argv[i]) {
  a = process.argv[i];
  if (a === '--user') dbUser = process.argv[i + 1]
  if (a === '--pass') dbPass = process.argv[i + 1]
  if (a === '--host') dbHost = process.argv[i + 1]
  if (a === '--db') db = process.argv[i + 1]
  i += 2
}

var databaseSettings = {
  connectionLimit: 10,
  user: dbUser,
  password: dbPass,
  host: dbHost,
  database: db
}
console.log('lancement avec les paramètres de connexion', databaseSettings)

describe('Database', function() {
  // data source du test
  var src = {
    i: 12,
    s: 'truc',
    d: new Date('01/02/2003 04:05:06')
  }

  describe('#indexOf()', function(){
    it('Initialisation des entités', function(done){
      entities = new Entities({database: databaseSettings});
      entities.initialize(done);
    });

    it("Initialisation de l'entité de test", function(done) {
      TestEntity = entities.define('TestEntity');
      TestEntity.construct(function() {
        this.created = new Date();
        this.i = undefined;
        this.s = undefined;
        this.d = undefined;
        // int, nb de secondes de d modulo 2
        this.p = undefined;
      });
      TestEntity.defineIndex('i', 'integer');
      TestEntity.defineIndex('s', 'string');
      TestEntity.defineIndex('d', 'date');
      TestEntity.defineIndex('p', 'integer', function() {
        return this.d.getSeconds() % 2;
      });
      entities.initializeEntity(TestEntity, done);
    });

    it("Ajout de données dans l'entité", function(done) {
      var entity = TestEntity.create(src);
      // valeurs de src inchangées
      // console.log('source', src); // ok
      // console.log('entity créée', entity); // i, s, d et p valent undefined
      assert.equal(entity.i, src.i);
      assert.equal(entity.s, src.s);
      assert.equal(entity.d.getTime(), src.d.getTime());
      assert.equal(entity.d.constructor.name, 'Date');
      // ajout de created
      assert.equal(entity.created.constructor.name, 'Date');
      entity.store(function(error, entity)  {
        if (error) return done(error);
        assert.equal(entity.i, src.i);
        assert.equal(entity.s, src.s);
        assert.equal(entity.d.getTime(), src.d.getTime());
        assert.equal(entity.created.constructor.name, 'Date');
        assert(entity.oid>0);
        done();
      });
    });

    it("Sélection d'entités", function(done) {
      TestEntity.match('p').equals(0).grab(function(error, result) {
        if (error) return done(error);

        assert(result && result.length>0);
        var entity = result[0];
        assert.equal(entity.i, src.i);
        assert.equal(entity.s, src.s);
        assert.equal(entity.d.getTime(), src.d.getTime());
        assert.equal(entity.created.constructor.name, 'Date');
        assert(entity.oid>0);
        done();
      });
    });
    it("Suppression d'entités", function(done) {
      flow()
      .seq(function() { TestEntity.match('p').equals(0).grab(this); })
      .seqEach(function(entity) {
        entity.delete(this);
      })
      .empty().seq(done).catch(done);
    });

    it("Vérification des suppressions", function(done) {
      TestEntity.match('p').equals(0).grab(function(error, result) {
        if (error) return done(error);
        assert(result.length===0);
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

    it('violent', function(done) {
      this.timeout(100000000);
      var count = 100;
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
      .seqEach(function(obj) {
        obj.i *= 2;
        obj.tag = 'updated';
        obj.store(this);
      })
      .seqEach(function(obj) {
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

  })
});

