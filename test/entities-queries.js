/* eslint-env mocha */
'use strict'
const _ = require('lodash')
const flow = require('an-flow')
const chai = require('chai')
const {expect} = chai
const sinon = require('sinon')
const sinonChai = require('sinon-chai')

const {checkEntity, quit, setup} = require('./init')

chai.use(sinonChai)

const nbEntities = 1500 // doit être supérieur à la hard limit de lassi
const bt = 1041476706000
const seconde = 1000
const STRING_PREFIX = 'test-'
const TYPES = ['type_a', 'type_b', 'type_c']

let TestEntity
/**
 * Vérifie si l'entité est celle attendue
 *
 * @param {Integer} i      Identifiant de l'entité
 * @param {Object}  entity Entité
 */
function assertEntity (i, entity) {
  const values = {
    i,
    s: STRING_PREFIX + i
  }
  const checkers = {
    d: (d) => d.getTime() === bt + seconde * i,
    dArray: (ar) => ar.length === 3 && ar.every(item => item.constructor.name === 'Date'),
    iArray: (ar) => ar.length === 3 && ar.every(item => typeof item === 'number'),
    sArray: (ar) => ar.length === 3 && ar.every(item => typeof item === 'string')
  }
  checkEntity(entity, values, checkers)
}

/**
 * Récupère l'ensemble des entités.
 *
 * @param {*} query Requête à executer
 * @param {Object} options Tableau d'options pour filtrer les entités
 * @param {sequencesCallback} callback Callback
 */
function getAllEntities (query, options, callback) {
  function grab (skip) {
    if (options.includeDeleted) query.includeDeleted()
    query.grab({limit: maxResults, skip}, (error, entities) => {
      if (error) return callback(error)
      allEntities = allEntities.concat(entities)
      if (entities.length === maxResults) grab(skip + maxResults)
      else callback(null, allEntities)
    })
  }

  const maxResults = 1000
  let allEntities = []
  grab(0)
}

/**
 * Fait un grabOne sur query, passe les assertions et appelle done
 * @param {EntityQuery} query
 * @param {function} checks liste d'assertions, appelée avec le résultat du grab
 * @param {simpleCallback} done
 */
function grabOneCheck (query, checks, done) {
  query.grabOne((error, entity) => {
    if (error) return done(error)
    checks(entity)
    done()
  })
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
      t: TYPES[Math.floor(Math.random() * 3)],
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

describe('Test entities-queries', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    // Evite les erreurs de timeout sur une machine lente (ou circleCI)
    this.timeout(60000)
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity) {
      TestEntity = Entity
      addData(this)
    }).done(done)
  })

  after('nettoie en sortant', quit)

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
        expect(deleted).to.equal('oui!')
        TestEntity.beforeDelete(function (cb) { cb() })
        this()
      }).done(done)
    })
  })

  describe('.match()', function () {
    it('jette une exception si le champ n\'est pas indexé', function () {
      expect(function () {
        TestEntity.match('nonIndexed').equals(1).grab(function () {
          // devrait throw avant d'arriver là, on le vérifie avec une assertion toujours fausse
          expect('On aurait pas dû arriver là').to.equal('')
        })
      }).to.throw('L’entity TestEntity n’a pas d’index nonIndexed')
    })
    let oid
    it('Recherche avec l\'opérateur AFTER sur une date', function (done) {
      const d = new Date(bt + seconde * (nbEntities - 760))
      TestEntity.match('d').after(d).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(759)
        oid = result[0].oid
        done()
      })
    })

    it('Recherche avec l\'opérateur AFTER pour un tableau de dates', function (done) {
      const d = new Date(bt + seconde * (nbEntities - 760))
      TestEntity.match('dArray').after(d).grab(function (error, result) {
        if (error) return done(error)
        // cas intéressant, on a un résultat en plus car l'entité dont entity.d === d
        // a aussi une valeur dans son dArray qui est "after" d.
        expect(result.length).to.equal(760)
        oid = result[0].oid
        done()
      })
    })

    it('Recherche exacte sur l\'oid', function (done) {
      TestEntity.match('oid').equals(oid).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        done()
      })
    })

    it('Recherche exacte sur une string', function (done) {
      TestEntity.match('s').equals(STRING_PREFIX + '198').grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        expect(result[0].i).to.equal(198)
        done()
      })
    })

    it('Recherche exacte sur un entier', function (done) {
      TestEntity.match('i').equals(198).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        expect(result[0].i).to.equal(198)
        done()
      })
    })

    it('Recherche exacte sur une date', function (done) {
      TestEntity.match('d').equals(new Date(bt + seconde * 198)).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        expect(result[0].i).to.equal(198)
        done()
      })
    })

    it('Recherche exacte sur une element d\'un tableau de string', function (done) {
      TestEntity.match('sArray').equals(STRING_PREFIX + (198 * 3 + 1)).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        expect(result[0].i).to.equal(198)
        done()
      })
    })

    it('Recherche exacte sur un element d\'un tableau d’entiers', function (done) {
      TestEntity.match('iArray').equals(198 * 3 + 1).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        expect(result[0].i).to.equal(198)
        done()
      })
    })

    it('Recherche exacte sur un element d\'un tableau de dates', function (done) {
      TestEntity.match('dArray').equals(new Date((bt + seconde * 198) + 100)).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(1)
        expect(result[0].i).to.equal(198)
        done()
      })
    })

    it('Recherche avec l\'opérateur IN pour une string', function (done) {
      TestEntity.match('s').in([STRING_PREFIX + '198', STRING_PREFIX + '196']).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(2)
        done()
      })
    })

    it('Recherche avec l\'opérateur IN sur un tableau vide (râle en console et ne remonte rien)', function (done) {
      // attention, mocha utilise la console donc on le rend muet le temps de cet appel
      sinon.stub(console, 'error')
      TestEntity.match('s').in([]).grab(function (error, result) {
        expect(console.error).to.have.been.calledOnce
        console.error.restore()
        if (error) return done(error)
        expect(result.length).to.equal(0)
        done()
      })
    })

    it('Recherche avec l\'opérateur NOT IN pour une string', function (done) {
      const notInArray = []
      for (let i = 0; i < nbEntities / 2; i++) {
        notInArray.push(STRING_PREFIX + i)
      }
      TestEntity.match('s').notIn(notInArray).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(750)
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
        expect(count).to.equal(5)
        this()
      }).seq(function () {
        // On teste une combinaison impossible
        TestEntity
          .match('s').like('test-4')
          .match('i').equals(5)
          .grab(this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(0)
        this()
      }).seq(function () {
        // On teste un "écrasement"
        TestEntity
          .match('i').equals(4)
          .match('i').equals(5)
          .grab(this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(1)
        expect(entities[0].i).to.equal(5)
        this()
      }).done(done)
    })

    it('Double match sur le même attribut avec les opérateurs IN et NOT IN pour une string', function (done) {
      TestEntity
        .match('s').in([STRING_PREFIX + '200', STRING_PREFIX + '198', STRING_PREFIX + '196'])
        .match('s').notIn([STRING_PREFIX + '200', STRING_PREFIX + '198'])
        .grab((error, result) => {
          if (error) return done(error)
          expect(result.length).to.equal(1)
          expect(result[0].s).to.equal(STRING_PREFIX + '196')
          done()
        })
    })

    it('Recherche avec l\'opérateur IN pour un tableau de string', function (done) {
      TestEntity.match('sArray').in([STRING_PREFIX + '199', STRING_PREFIX + '196']).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(2)
        done()
      })
    })
  })

  describe('.grab()', function () {
    it('Sélection d\'entités', function (done) {
      this.timeout(10000)
      flow().seq(function () {
        TestEntity.match('iPair').equals(0).grab(this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(nbEntities / 2)
        entities.forEach(entity => assertEntity(entity.i, entity))
        this()
      }).done(done)
    })

    it('Sélection d\'entités avec limit', function (done) {
      this.timeout(10000)
      flow().seq(function () {
        TestEntity.match().grab({offset: 100, limit: 100}, this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(100)
        entities.forEach(function (entity, i) {
          assertEntity(100 + i, entity)
        })
        this()
      }).done(done)
    })

    it('Sélection d\'entités avec limit 0', function (done) {
      this.timeout(10000)
      flow().seq(function () {
        TestEntity.match().grab({offset: 100, limit: 0}, this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(0)
        this()
      }).done(done)
    })

    it('Sélection d\'entités avec hard limit', function (done) {
      function last (error) {
        expect(console.error).to.have.been.calledThrice
        console.error.restore()
        done(error)
      }
      this.timeout(10000)
      sinon.stub(console, 'error')
      flow().seq(function () {
        TestEntity.match().grab(this)
      }).seq(function (entities) {
        expect(entities.length).to.equal(1000)
        expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/HARD_LIMIT_GRAB atteint/))
        entities.forEach(function (entity, i) {
          assertEntity(i, entity)
        })
        this()
      }).seq(function () {
        TestEntity.match().grab({limit: 1200}, this)
        expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/limit 1200 trop élevée/))
        expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/HARD_LIMIT_GRAB atteint/))
      }).seq(function (entities) {
        expect(entities.length).to.equal(1000)
        entities.forEach(function (entity, i) {
          assertEntity(i, entity)
        })
        this()
      }).done(last)
    })

    it('Recherche simple ne donnant rien', function (done) {
      TestEntity.match('iPair').equals(666).grabOne(function (error, result) {
        if (error) return done(error)
        expect(result).to.be.undefined
        done()
      })
    })

    it('Recherche multiple ne donnant rien', function (done) {
      TestEntity.match('iPair').equals(666).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(0)
        done()
      })
    })
  })

  describe('.sort()', function () {
    it('Tri d\'entités', function (done) {
      // on ajoute une limite pour pas tomber sur le hardLimit
      flow().seq(function () {
        TestEntity.match().sort('i', 'asc').grab({limit: 10}, this)
      }).seq(function (entities) {
        expect(entities[0].i).to.equal(0)
        expect(entities[1].i).to.equal(1)

        TestEntity.match().sort('i', 'desc').grab({limit: 10}, this)
      }).seq(function (entities) {
        expect(entities[0].i).to.equal(nbEntities - 1)
        expect(entities[1].i).to.equal(nbEntities - 2)

        // on vérifie que ça fonctionne aussi pour oid
        TestEntity.match().sort('oid', 'asc').grab({limit: 10}, this)
      }).seq(function (entities) {
        expect(entities[0].i).to.equal(0)
        expect(entities[1].i).to.equal(1)

        TestEntity.match().sort('oid', 'desc').grab({limit: 10}, this)
      }).seq(function (entities) {
        expect(entities[0].i).to.equal(nbEntities - 1)
        expect(entities[1].i).to.equal(nbEntities - 2)
        done()
      }).catch(done)
    })
  })

  describe('.count()', function () {
    it('Compte d\'entités', function (done) {
      flow().seq(function () {
        TestEntity.match('i').equals(1).count(this)
      }).seq(function (count) {
        expect(count).to.equal(1)
        this()
      }).seq(function () {
        // Test avec un matcher plus complexe
        TestEntity.match('i').lowerThanOrEquals(9).count(this)
      }).seq(function (count) {
        expect(count).to.equal(10)
        this()
      }).done(done)
    })
  })

  describe('.countBy()', function () {
    it('Compte d\'entités groupés', function (done) {
      let groupedEntities
      let nbEntities
      flow()
        .seq(function () {
          getAllEntities(TestEntity.match(), {}, this)
        }).seq(function (_entities) {
          nbEntities = _entities.length
          // on vérifie que le countBy de Entities donne le même résultat que celui de lodash
          groupedEntities = _.countBy(_entities, 't')
          TestEntity.match().countBy('t', this)
        }).seq(function (data) {
          _.forEach(groupedEntities, (value, key) => {
            expect(data[key]).to.equal(value)
          })
          // on teste que ça remonte aussi le nb de non indexés (index undefined ou null)
          TestEntity.match().countBy('bArray', this)
        }).seq(function (data) {
          expect(data.null).to.equal(nbEntities)
          // on teste aussi que le groupBy sur un index qui n'existe pas remonte une erreur
          try {
            TestEntity.match().countBy('y', () => {})
            done(new Error('countBy sur un index inexistant n’a pas planté'))
          } catch (e) {
            expect(e.message).to.equal('L’entity TestEntity n’a pas d’index y')
            done()
          }
        }).catch(done)
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
        expect(resultats.length).to.equal(1)
        expect(resultats[0].s).to.equal('texte à chercher')
        resultats[0].s = texteOriginal
        resultats[0].store(this)
      }).done(done)
    })
  })
  describe('Suppression "douce" d\'une entité()', function () {
    var createdEntities
    var deletedEntity
    var nonDeletedEntity
    var started

    beforeEach(function (done) {
      started = new Date()

      var entities = [
        {i: 42000}, // <-- celle là sera soft-deleted
        {i: 42001}
      ]

      flow(entities)
        .seqEach(function (entity) {
          TestEntity.create(entity).store(this)
        })
        .seq(function (instances) {
          createdEntities = instances
          nonDeletedEntity = createdEntities[1]
          createdEntities[0].softDelete(this)
        })
        .seq(function (_deletedEntity) {
          deletedEntity = _deletedEntity
          done()
        })
        .catch(done)
    })

    afterEach(function (done) {
      // Cleanup des entités créés par ce test (mais pas les autres créé au before du test englobant)
      flow(createdEntities)
        .seqEach(function (entity) {
          entity.delete(this)
        })
        .done(done)
    })

    describe('Deleted entity', function () {
      it('Renvoie true pour isDeleted()', function () {
        expect(deletedEntity.isDeleted()).to.equal(true)
      })
      it('N\'apparaît plus dans le grab par defaut', function (done) {
        flow()
          .seq(function () {
            TestEntity.match('oid').equals(deletedEntity.oid).grabOne(this)
          })
          .seq(function (entity) {
            expect(entity).to.equal(undefined)
            this()
          })
          .done(done)
      })
      it('Apparaît avec onlyDeleted()', function (done) {
        flow()
          .seq(function () {
            TestEntity.match('oid').equals(deletedEntity.oid).onlyDeleted().grabOne(this)
          })
          .seq(function (entity) {
            expect(entity.oid).to.equal(deletedEntity.oid)
            this()
          })
          .done(done)
      })
      it('Apparaît avec includeDeleted()', function (done) {
        flow()
          .seq(function () {
            TestEntity.match('oid').equals(deletedEntity.oid).includeDeleted().grabOne(this)
          })
          .seq(function (entity) {
            expect(entity.oid).to.equal(deletedEntity.oid)
            this()
          })
          .done(done)
      })
      it('Peut être trouvée par deletedAfter()', function (done) {
        // @todo voir pourquoi entity est parfois (mais rarement) undefined
        // ça semble réglé par le quit qui était fait avant la cb du after générique (maintenant dans la cb)
        grabOneCheck(
          TestEntity.match().deletedAfter(started),
          (entity) => expect(entity.oid).to.equals(deletedEntity.oid),
          done
        )
      })
      it('N’est pas remontée par deletedAfter(now)', function (done) {
        grabOneCheck(
          TestEntity.match().deletedAfter(Date.now()),
          (entity) => expect(entity).to.equals(undefined),
          done
        )
      })
      it('Peut être trouvée par deletedBefore()', function (done) {
        flow()
          .seq(function () {
            TestEntity.match().deletedBefore(new Date(Date.now() + 1000)).grabOne(this)
          })
          .seq(function (entity) {
            expect(entity.oid).to.equal(deletedEntity.oid)
            TestEntity.match().deletedBefore(started).grabOne(this)
          })
          .seq(function (entity) {
            expect(entity).to.equal(undefined)
            this()
          })
          .done(done)
      })
      it('Peut être restaurée', function (done) {
        flow()
          .seq(function () {
            deletedEntity.restore(this)
          })
          .seq(function (entityRestored) {
            expect(entityRestored.isDeleted()).to.be.false
            expect(entityRestored.i).to.equal(deletedEntity.i)
            expect(entityRestored.oid).to.equal(deletedEntity.oid)
            // On vérifie la mise à jour en bdd
            TestEntity.match('oid').equals(deletedEntity.oid).grabOne(this)
          })
          .seq(function (entity) {
            expect(entity.isDeleted()).to.be.false
            expect(entity.i).to.equal(deletedEntity.i)
            expect(entity.oid).to.equal(deletedEntity.oid)
            this()
          })
          .done(done)
      })
      it('Peut être store', function (done) {
        flow()
          .seq(function () {
            deletedEntity.store(this)
          })
          .seq(function (entity) {
          // Elle doit toujours etre "deleted"
            expect(entity.isDeleted()).to.equal(true)
            // On vérifie en bdd
            TestEntity.match('oid').equals(deletedEntity.oid).onlyDeleted().grabOne(this)
          })
          .seq(function (entity) {
            expect(entity.isDeleted()).to.equal(true)
            expect(entity.oid).to.equal(deletedEntity.oid)
            this()
          })
          .done(done)
      })
    })

    describe('Non-deleted entity', function () {
      it('Renvoie false pour isDeleted()', function () {
        expect(nonDeletedEntity.isDeleted()).to.equal(false)
      })
      it('N\'apparaît pas avec onlyDeleted()', function (done) {
        flow()
          .seq(function () {
            TestEntity.match('oid').equals(nonDeletedEntity.oid).onlyDeleted().grabOne(this)
          })
          .seq(function (entity) {
            expect(entity).to.equal(undefined)
            this()
          })
          .done(done)
      })
      it('Apparaît avec includeDeleted()', function (done) {
        flow()
          .seq(function () {
            TestEntity.match('oid').equals(nonDeletedEntity.oid).includeDeleted().grabOne(this)
          })
          .seq(function (entity) {
            expect(entity.oid).to.equal(nonDeletedEntity.oid)
            this()
          })
          .done(done)
      })
    })
  })

  describe('.delete()', function () {
    it('Suppression de la moitié des entités', function (done) {
      flow()
        .seq(function () {
          TestEntity.match('iPair').equals(1).grab(this)
        }).seq(function (entities) {
          expect(entities.length).to.equal(nbEntities / 2)
          this(null, entities)
        }).seqEach(function (entity) {
          entity.delete(this)
        }).done(done)
    })

    it('Vérification des suppressions', function (done) {
      TestEntity.match('iPair').equals(1).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(0)
        done()
      })
    })

    it('Vérification des non suppressions', function (done) {
      TestEntity.match('iPair').equals(0).grab(function (error, result) {
        if (error) return done(error)
        expect(result.length).to.equal(nbEntities / 2)
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
        expect(entity.i).to.equal(data.i)
        expect(entity.s).to.equal(data.s)
        expect(entity.d).to.equal(data.d)
        expect(typeof entity.i).to.equal('string')
        expect(typeof entity.s).to.equal('number')
        expect(typeof entity.d).to.equal('string')
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
      this.timeout(10000)
      const count = 1000
      const objs = []
      for (let i = 0; i < count; i++) {
        objs.push(TestEntity.create({
          i: i,
          s: STRING_PREFIX + i,
          d: new Date(new Date().getTime() + 1000 * i)
        }))
      }

      flow(objs)
        .parEach(function (obj) {
          obj.store(this)
        }).parEach(function (obj) {
          obj.i *= 2
          obj.tag = 'updated'
          obj.store(this)
        }).seqEach(function (obj) {
          obj.delete(this)
        }).seq(function () {
          done()
        }).catch(console.error)
    })
  })

  describe('.purge()', function () {
    before(function (done) {
      const entities = []
      for (let i = 0; i < nbEntities; i++) {
        entities.push({
          i: i,
          s: STRING_PREFIX + i
        })
      }
      flow(entities)
        .seqEach(function (entity) {
          TestEntity.create(entity).store(this)
        })
        .done(done)
    })

    it('Purge des entités', function (done) {
      flow().seq(function () {
        TestEntity.match().count(this)
      }).seq(function (nb) {
        expect(nb).to.equal(nbEntities)
        TestEntity.match('i').lowerThan(8).purge(this)
      }).seq(function (nbDeleted) {
        expect(nbDeleted).to.equal(8)
        TestEntity.match('s').equals(STRING_PREFIX + 42).purge(this)
      }).seq(function (nbDeleted) {
        expect(nbDeleted).to.equal(1)
        TestEntity.match('i').lowerThan(45).match('i').greaterThan(40).purge(this)
      }).seq(function (nbDeleted) {
        expect(nbDeleted).to.equal(3) // 41, 43, 44
        TestEntity.match().purge(this)
      }).seq(function (nbDeleted) {
        expect(nbDeleted).to.equal(nbEntities - 12)
        TestEntity.match().count(this)
      }).seq(function (count) {
        expect(count).to.equal(0)
        this()
      }).done(done)
    })
  })

  describe('.softPurge()', function () {
    before(function (done) {
      const entities = []
      for (let i = 0; i < nbEntities; i++) {
        entities.push({
          i: i,
          s: STRING_PREFIX + i
        })
      }
      flow(entities)
        .seqEach(function (entity) {
          TestEntity.create(entity).store(this)
        })
        .done(done)
    })

    after((done) => TestEntity.match().includeDeleted().purge(done))

    it('softDelete des entités', function (done) {
      flow().seq(function () {
        TestEntity.match().count(this)
      }).seq(function (nb) {
        expect(nb).to.equal(nbEntities)
        TestEntity.match('i').lowerThan(8).softPurge(this)
      }).seq(function (nbSoftDeleted) {
        expect(nbSoftDeleted).to.equal(8)
        TestEntity.match('s').equals(STRING_PREFIX + 42).softPurge(this)
      }).seq(function (nbSoftDeleted) {
        expect(nbSoftDeleted).to.equal(1)
        TestEntity.match('i').lowerThan(45).match('i').greaterThan(40).softPurge(this)
      }).seq(function (nbSoftDeleted) {
        expect(nbSoftDeleted).to.equal(3) // 41, 43, 44
        TestEntity.match().softPurge(this)
      }).seq(function (nbSoftDeleted) {
        expect(nbSoftDeleted).to.equal(nbEntities - 12)
        TestEntity.match().count(this)
      }).seq(function (count) {
        expect(count).to.equal(0)
        this()
      }).done(done)
    })
  })

  describe('sort', function () {
    before(function (done) {
      const entities = [
        {oid: 'b', i: 2, s: 'deux', sArray: ['bb, ba, bc']},
        {oid: 'c', i: 3, s: 'trois', sArray: ['ca', 'cc', 'cb']},
        {oid: 'a', i: 1, s: 'un', sArray: ['ac', 'ab', 'aa']}
      ]
      flow(entities).seqEach(function (entity) {
        TestEntity.create(entity).store(this)
      }).done(done)
    })
    after(function (done) {
      TestEntity.match().purge(done)
    })

    it('byOid', function (done) {
      flow().seq(function () {
        TestEntity.match().grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.i).join(',')).to.equal('2,3,1') // dans l'ordre d'insertion par défaut
        TestEntity.match().sort('oid').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.i).join(',')).to.equal('1,2,3') // par oid
        TestEntity.match().sort('i').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.i).join(',')).to.equal('1,2,3') // par i
        TestEntity.match().sort('s').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.i).join(',')).to.equal('2,3,1') // par string
        TestEntity.match().sort('sArray').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.i).join(',')).to.equal('1,2,3') // par sArray
        this()
      }).done(done)
    })
  })

  describe('.forEachEntity', () => {
    // 415 pour avoir plus que 2 batch
    const ENTITY_COUNT = 415
    beforeEach((done) => {
      const oids = _.times(ENTITY_COUNT, (i) => 'oid-' + i)
      flow(oids)
        .seqEach(function (oid) {
          TestEntity.create({ oid, s: 'forEachEntity' }).store(this)
        })
        .empty()
        .done(done)
    })
    afterEach((done) => {
      TestEntity.match('s').equals('forEachEntity').purge(done)
    })

    it('traite toutes les entités d\'une requête', (done) => {
      let count = 0
      flow()
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').forEachEntity(
            (entity, cb) => {
              entity.treated = true
              entity.store(cb)
            },
            this
          )
        })
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').grab(this)
        })
        .seqEach(function (entity) {
          expect(entity.treated).to.equal(true)
          count++
          this()
        })
        .seq(function () {
          expect(count).to.equal(ENTITY_COUNT)
          this()
        })
        .done(done)
    })

    it('empêche onEachEntity d\'appeller plusieurs fois son callback', (done) => {
      let treated = 0
      sinon.stub(console, 'error')

      flow()
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').forEachEntity(
            (entity, cb) => {
              treated++

              cb()
              cb()
            },
            this
          )
        })
        .seq(function () {
          // Le traitement du deuxième appel cb() passe dans le loop suivante, on fait un setTimeout
          // pour attraper les console error
          setTimeout(() => {
            // Sans le garde-fou on aurait eu beaucoup plus de passages dans onEachEntity
            // vu que chaque deuxième appel de cb déclenche un onEachEntity supplémentaire
            // sur les éléments qui suivent, récursivement !
            expect(treated).to.equal(ENTITY_COUNT)

            sinon.assert.callCount(console.error, ENTITY_COUNT)
            _.times(ENTITY_COUNT, (i) => {
              expect(console.error.getCall(i).args[0].message).to.equal('ERROR: forEachEntity onEntity callback function called many times')
            })
            console.error.restore()

            this()
          }, 1)
        })
        .done(done)
    })

    it('remonte l\'erreur est arrête le traitement si une entité échoue', (done) => {
      let treated = 0
      const onEach = (entity, cb) => {
        if (treated === 2) return cb(Error('Ooops la 3ème entité échoue !'))
        entity.treated = true
        treated++
        entity.store(cb)
      }
      flow().seq(function () {
        TestEntity.match('s').equals('forEachEntity').forEachEntity(onEach, this)
      }).seq(function () {
        done(Error('ça n’a pas planté alors que ça aurait dû'))
      }).catch((error) => {
        expect(treated).to.equal(2) // on n'est pas allé plus loin
        expect(error.message).to.equal('Ooops la 3ème entité échoue ! (sur oid-2)')
        done()
      })
    })

    it('traite un petit (< 200) sous-ensemble des entités d\'une requête', (done) => {
      flow()
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').forEachEntity(
            (entity, cb) => {
              entity.treated = true
              entity.store(cb)
            },
            this,
            { limit: 10 }
          )
        })
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').grab(this)
        })
        .seq(function (entities) {
          _.forEach(entities, (groupe, index) => {
            if (index < 10) {
              expect(groupe.treated).to.equal(true)
            } else {
              expect(groupe.treated).to.equal(undefined)
            }
            this()
          })
        })
        .empty()
        .done(done)
    })

    it('traite un grand (> 200, le batch size) sous-ensemble des entités d\'une requête', (done) => {
      flow()
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').forEachEntity(
            (entity, cb) => {
              entity.treated = true
              entity.store(cb)
            },
            this,
            { limit: 210 }
          )
        })
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').grab(this)
        })
        .seq(function (entities) {
          _.forEach(entities, (groupe, index) => {
            if (index < 210) {
              expect(groupe.treated).to.equal(true)
            } else {
              expect(groupe.treated).to.equal(undefined)
            }
            this()
          })
        })
        .empty()
        .done(done)
    })

    it('traite un sous-ensemble de 200 éléments (batch size) des entités d\'une requête', (done) => {
      flow()
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').forEachEntity(
            (entity, cb) => {
              entity.treated = true
              entity.store(cb)
            },
            this,
            { limit: 200 }
          )
        })
        .seq(function () {
          TestEntity.match('s').equals('forEachEntity').grab(this)
        })
        .seq(function (entities) {
          _.forEach(entities, (groupe, index) => {
            if (index < 200) {
              expect(groupe.treated).to.equal(true, `l'entité index=${index} devrait être traitée`)
            } else {
              expect(groupe.treated).to.equal(undefined, `l'entité index=${index} ne devrait pas   être traitée`)
            }
            this()
          })
        })
        .empty()
        .done(done)
    })
  })
})
