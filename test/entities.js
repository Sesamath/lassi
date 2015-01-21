'use strict';
/*
 * @preserve This file is part of "lassi".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

require('lassi');
var assert = lassi.assert;
var flow = require('seq');

var entity = lassi.Entity('PersonTest', {
  construct: function() {
    this.created = new Date();
    this.name = undefined;
    this.born = undefined;
    this.interests = [];
    this.bio = undefined;
    this.number = 12345;
  },
});

entity
  .on('beforeStore', function() { this.changed = new Date(); })
  .on('afterLoad', function() { this.loaded = true; })
  .defineIndex('born', 'date')
  .defineIndex('member', 'boolean')
  .defineIndex('name', 'string')
  .defineIndex('email', 'string')
  .defineIndex('interests', 'string')
  .defineIndex('age', 'integer', function() {
    return (new Date()).getFullYear() - new Date(this.born).getFullYear();
  });

entity.grabByName = function(name, callback) {
  return this.match('name').equals(name).grabOne(callback);
}

describe('entities', function() {
  var entities;
  var o;
  var database = {
    client: 'mysql',

    connection : {
      host     : 'localhost',
      user     : 'root',
      password : 'toto',
      database : 'lassi_tests'
    }
  };
  //database = {
    //client: 'pgsql',

    //connection : {
      //host     : 'antinea',
      //user     : 'postgres',
      //password : 'toto',
      //database : 'lassi_tests'
    //}
  //};

  it('Initialisation', function() {
    entities = new lfw.entities.Manager({ database : database });
  });

  /*
  it('Netoyage de la base', function(done) {
    if (database.client=='mysql') {
      exec('echo "drop database lassi_tests;" | mysql -uroot -ptoto -hantinea', function() {
        exec('echo "create database lassi_tests;" | mysql -uroot -ptoto -hantinea', function() {
          done();
        });
      });
    }
    if (database.client=='pg') {
      this.timeout(10000);
      exec('dropdb -Upostgres lassi_tests', function() {
        exec('createdb -Upostgres lassi_tests', function() {
          done();
        });
      });
    }
  });
  */

  it('Initialisation du stockage [180ms]', function(done) {
    entity.bless(entities);
    entities.register(entity);
    var event = false;

    assert.equals(entity.table, 'person_test');

    // L'évènement est déclanché avant la callback de la fonction
    entities.once('storageIntialized', function(name) {
      assert.equals(name, 'PersonTest');
      event = true;
    })
    entities.initializeStorage(function(error) {
      assert.true(event);
      done(error);
    });
  });

  it("Création d'une instance et sauvegarde", function(done) {
    var instance = entity.create({
      name       : 'gaston',
      member     : true,
      born       : new Date(74780223*1000),
      interests  : [ 'sport', 'computing' ],
      email      : 'truc@machin.com'
    });
    assert.defined(instance.created);

    //assert.instanceOf(instance.instanceOf(lfw.entities.EntityInstance));
    //assert.instanceOf(instance.instanceOf(PersonTest));
    instance.store(function(error, saved) {
      if (error) return done(error);
      assert.not.empty(saved);
      assert.greater(saved.oid, 0);
      assert.defined(saved.changed);
      done();
    });
  });

  it('Comptage des objets en base', function(done) {
    entity.match('oid').greaterThan(0).count(function(error, count) {
      if (error) return done(error);
      assert.equals(count, 1);
      done();
    });
  });

  it("Chargement d'un objet", function(done) {
    entity.match('oid').greaterThan(0).grab(function(error, rows) {
      if (error) return done(error);
      assert.equals(rows.length, 1);
      o = rows[0];
      assert.not.empty(o.oid);
      assert.equals(o.name, 'gaston');
      assert.undefined(o.bio);
      assert.equals(o.email, 'truc@machin.com');
      assert.equals(o.interests, ['sport', 'computing']);
      assert.instanceOf(o.born, Date);
      assert.true(o.loaded); // Preuve que on('afterLoad') a été appelé
      done();
    });
  });

  it("Modification d'un objet", function(done) {
    o.name = 'toto';
    assert.empty(o._indexes);
    o.store(function(error, oo) {
      if (error) return done(error);
      assert.true(oo===o);
      assert.not.empty(oo._indexes);
      assert.not.empty(oo.oid);
      assert.equals(o.oid, oo.oid);
      assert.equals(o.name, 'toto');
      oo.name = 'robert';
      oo.store(function(error, ooo) {
        if (error) return done(error);
        assert.true(ooo===o);
        assert.not.empty(ooo._indexes);
        assert.not.empty(ooo.oid);
        assert.equals(o.oid, ooo.oid);
        assert.equals(ooo.name, 'robert');
        done();
      })
    });
  });

  it("Requête = string", function(done) {
    entity.grabByName('robert', function(error, result) {
      if (error) return done(error);
      assert.not.null(result);
      assert.equals(result.name, 'robert');
      done();
    });
  });

  it("Requête IN string", function(done) {
    entity.match('name').in(['robert', 'gaston']).grab(function(error, result) {
      if (error) return done(error);
      assert.equals(result.length, 1);
      assert.equals(result[0].name, 'robert');
      done();
    });
  });

  it("Requête BETWEEN integer", function(done) {
    entity.match('age').between(40,50).grab(function(error, result) {
      if (error) return done(error);
      assert.equals(result.length, 1);
      assert.equals(result[0].name, 'robert');
      done();
    });
  });

  it("Requête <= date", function(done) {
    entity.match('born').lowerThan(new Date()).grab(function(error, result) {
      if (error) return done(error);
      assert.equals(result.length, 1);
      assert.equals(result[0].name, 'robert');
      done();
    });
  });


  it("Requête sur le booléenne d'un objet", function(done) {
    entity.match('member').true().grab(function(error, result) {
      if (error) return done(error);
      assert.equals(result.length, 1);
      assert.equals(result[0].name, 'robert');
      done();
    });
  });

  it("Ne doit renvoyer aucun résultat car aucun n'a de 'member' à 'false'", function(done) {
    entity.match('member').false().grab(function(error, result) {
      if (error) return done(error);
      assert.equals(result.length, 0);
      done();
    });
  });

  it('Ajout massif [500ms]', function(done) {
    var instances = [];
    for(var i=0; i < 100; i++) {
      instances.push(entity.create({
        name       : 'gaston'+i,
        member     : i%2===0,
        born       : new Date(74780223*1000+i*3600*24),
        interests  : [ 'sport', 'computing', 'tag'+i ],
        email      : 'truc'+i+'@machin.com'
      }));
    }
    this.timeout(10000);
    flow(instances)
      .seqEach(function(instance) {
        var _this = this;
        instance.store(function(error, object) {
          _this(error, object);
        });
      })
      .empty()
      .seq(done)
      .catch(done);
  });

  it('Pool/timeout [1000ms]', function(done) {
    var ok = 0;
    var connexions = [];
    var ko = 0;
    var settings = entities.database.settings;
    var outOfConnexion = 7;
    var nbConnexions = settings.pool + outOfConnexion;
    for (var i=0; i < nbConnexions; i++) {
      entities.database.getConnection(function(error, connection) {
        if (error) {
          ko++;
        } else {
          ok++;
          connexions.push(connection);
        }
        if (ok+ko==nbConnexions) {
          assert.equals(ok, settings.pool);
          assert.equals(ko, outOfConnexion);
          for(var j in connexions) {
            connexions[j].release();
          }
          done();
        }
      });

    }
  })

  it('Pool/stock [1200ms]', function(done) {
    var settings = entities.database.settings;
    settings.waitTimeout = 3000;
    var outOfConnexion = 7;
    var nbConnexions = settings.pool + outOfConnexion;
    var count = 0;
    for (var i=0; i < nbConnexions; i++) {
      entities.database.getConnection(function(error, connection) {
        if (error) throw error;
        setTimeout(function() {
          connection.release();
          count++;
          if (count==nbConnexions) done();
        }, 200)
      });
    }
  })

});
