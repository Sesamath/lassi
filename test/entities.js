var Entities = require('../classes/entities');
var entities, TestEntity;
var assert = require('assert');
var flow = require('seq');
var databaseSettings = {
  connectionLimit: 10,
  user: "root",
  password: "app",
  database: "app"
}

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
      .flatten()
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
  })
});

