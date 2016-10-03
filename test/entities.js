var Entities = require('../source/entities');
var entities, TestEntity;
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
      var entity = TestEntity.create({
        i: 12,
        s: 'truc',
        d: new Date('01/02/2003 04:05:06')
      });
      assert.equal(entity.i, 12);
      assert.equal(entity.s, 'truc');
      assert.equal(entity.d.getTime(), 1041476706000);
      assert.equal(entity.created.constructor.name, 'Date');
      entity.store(function(error, entity)  {
        if (error) return done(error);
        assert.equal(entity.i, 12);
        assert.equal(entity.s, 'truc');
        assert.equal(entity.d.getTime(), 1041476706000);
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
        assert.equal(entity.i, 12);
        assert.equal(entity.s, 'truc');
        assert.equal(entity.d.getTime(), 1041476706000);
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

  })
});

