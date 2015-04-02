var _ = require('lodash');
var flow = require('seq');
var assert = require("assert")
var squel = require("squel");
var DatabaseManager = require('../classes/database');
var dbClient;
var databaseSettings = {
  client: "mysql",
  connection: {
    user: "root",
    password: "app",
    database: "app"
  }
}

describe('Database', function() {

  describe('#indexOf()', function(){
    it('Connecion à la base', function(done){
      DatabaseManager.instance().createClient(databaseSettings, function(error, client) {
        if (error) return done(error);
        dbClient = client;
        done();
      });
    })

    it("Ménage", function(done) {
      dbClient.hasTable('tests', function(error, exists) {
        if (error || !exists) return done(error);
        dbClient.execute('DROP TABLE tests', function(error) {
          if (error) return done(error);
          done();
        });
      });
    })

    it('Création de la table de test', function(done){
      var sql = [
        "CREATE TABLE tests (",
        " oid int(11) unsigned NOT NULL AUTO_INCREMENT,",
        " data varchar(200),",
        " PRIMARY KEY (oid)",
        ") ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8"];
      dbClient.execute(sql.join('\n'), function(error, client) {
        if (error) return done(error);
        done();
      });
    })

    it('Insertion de données', function(done) {
      var data = [];
      for(var i=0; i < 1000; i++) {
        data.push(i);
      }
      flow(data)
        .parEach(20, function(value) {
          dbClient.execute(squel
           .insert()
           .into("tests")
           .set("data", value)
           .toString(), this)
        })
        .empty().seq(done).catch(done);
    });
  })
})
