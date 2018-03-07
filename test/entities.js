/* eslint-env mocha */
'use strict'

const _ = require('lodash')
const expect = require('chai').expect
const flow = require('an-flow')
const Entities = require('../source/entities')
const Entity = require('../source/entities/Entity')
const {quit, setup} = require('./init')

let entities
let TestEntity

// TODO: tester les autres beforeStore, beforeDelete & co
//       ou ramener les tests qui sont dans entities-queries.js
describe('Entity', () => {
  before((done) => {
    flow()
      .seq(function () {
        setup(this)
      })
      .seq(function (Entity, dbSettings) {
        entities = new Entities({database: dbSettings})
        entities.initialize(done)
      })
      .catch(done)
  })

  after(() => {
    entities.close()
    quit()
  })

  describe('EntityDefinition#onLoad', function () {
    let count
    beforeEach(function (done) {
      count = 0
      TestEntity = entities.define('TestEntity')
      TestEntity.onLoad(function () {
        this.$loaded = `load-${++count}`
      })
      TestEntity.flush(() => {
        TestEntity.initialize(done)
      })
    })

    it('est appelée après un store de création', (done) => {
      const entity = TestEntity.create({})
      expect(entity.$loaded).to.be.undefined

      entity.store(function (err, storedEntity) {
        if (err) return done(err)
        // .store() doit charger le beforeLoaded.
        // Le but du loaded étant principalement de garder l'état initial des valeurs
        // de l'entity pour appliquer des traitement dans le beforeStore(), il est utile
        // de le recharger après un store (en cas de deuxième store consécutif même si c'est
        // peu probable).
        expect(storedEntity.$loaded).to.equal('load-1')
        done()
      })
    })

    describe('avec une entité en bdd,', () => {
      let storedEntity
      beforeEach((done) => {
        const entity = TestEntity.create({})
        flow()
          .seq(function () {
            entity.store(this)
          })
          .seq(function () {
            TestEntity.match().grabOne(this)
          })
          .seq(function (entity) {
            storedEntity = entity
            this()
          })
          .done(done)
      })

      it('est appelé après un grab', () => {
        expect(storedEntity.$loaded).to.equal('load-2')
      })
      it('est appelé après le beforeStore', (done) => {
        expect(storedEntity.$loaded).to.equal('load-2')
        TestEntity.afterStore(function () {
          const entity = this
          // on a encore la valeur courante (si l'on veut faire des traitement concernant
          // les modifications opérées dans ce store)
          expect(entity.$loaded).to.equal('load-2')
          done()
        })
        storedEntity.store(this)
      })
      it('est appelé après un store', (done) => {
        storedEntity.store(function (err, entity) {
          if (err) return done(err)
          expect(entity.$loaded).to.equal('load-3')
          done()
        })
      })
    })
  })
  describe('Entity#store', function () {
    beforeEach(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.flush(() => {
        TestEntity.initialize(done)
      })
    })

    it('enlève les attributs temporaire en bdd', (done) => {
      const entity = TestEntity.create({nonTemporaire: 1, $temporaire: 2})
      flow()
        .seq(function () {
          entity.store(this)
        })
        .seq(function ({oid}) {
          TestEntity.match('oid').equals(oid).grabOne(this)
        })
        .seq(function (dbEntity) {
          expect(dbEntity.nonTemporaire).to.equal(1)
          expect(dbEntity.$temporaire).to.be.undefined
          this()
        })
        .done(done)
    })

    describe('.beforeStore', () => {
      it(`est appelée avec un oid lors d'une création`, (done) => {
        // Cas d'utilisation principale du afterStore :
        // faire des opération sur l'oid à la fois pour la création et la mise à jour
        TestEntity.afterStore(function () {
          const entity = this
          expect(entity.oid).to.not.be.undefined
          done()
        })
        TestEntity.create({}).store()
      })
    })
  })

  describe('EntityDefinition#defineMethod', () => {
    beforeEach(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.defineMethod('who', function () {
        return `My name is ${this.name}`
      })
      TestEntity.defineMethod('toJSON', function () {
        return _.omit(this.values(), ['password'])
      })
      TestEntity.flush(() => {
        entities.initialize(done)
      })
    })
    it('ajoute une méthode à chaque instance', (done) => {
      const entity = TestEntity.create({name: 'John', password: 'secret'})
      expect(entity.who()).to.equal('My name is John')
      expect(entity.password).to.equal('secret')
      // password masqué
      expect(JSON.stringify(entity)).to.equal('{"name":"John"}')

      flow()
        .seq(function () { entity.store(this) })
        .seq(function () { TestEntity.match().grabOne(this) })
        .seq(function (dbEntity) {
          expect(dbEntity.who()).to.equal('My name is John')
          // password en bdd
          expect(dbEntity.password).to.equal('secret')
          // mais toujours masqué en json
          expect(JSON.stringify(dbEntity)).to.equal(`{"name":"John","oid":"${dbEntity.oid}"}`)
          done()
        })
        .catch(done)
    })

    it("n'affecte pas les autres types d'entité", () => {
      const Before = entities.define('Before')
      const MonEntity = entities.define('MonEntity')
      MonEntity.defineMethod('hello', function () {
        return 'hello'
      })
      const After = entities.define('After')

      expect(MonEntity.create().hello()).to.equal('hello')
      expect(Before.create().hello).to.be.undefined
      expect(After.create().hello).to.be.undefined
    })
  })

  describe('EntityDefinition#create', () => {
    beforeEach(function () {
      TestEntity = entities.define('TestEntity')
    })
    it('creates an instance of Entity', () => {
      const entity = TestEntity.create({a: 1})
      expect(entity instanceof Entity).to.be.true
      expect(entity.a).to.equal(1)
    })
    it('creates an instance of EntityDefinition.entityConstructor', () => {
      const entity = TestEntity.create({a: 1})
      expect(entity instanceof TestEntity.entityConstructor).to.be.true
    })
  })

  describe('EntityDefinition#trackAttribute', () => {
    beforeEach(function () {
      TestEntity = entities.define('TestEntity')
      TestEntity.trackAttribute('nom')
    })

    describe('à la création', () => {
      it(`renvoie toujours has changed true et was null`, () => {
        [
          TestEntity.create({nom: 'foo'}),
          // Ces cas sont important, car on s'appuiera souvent souvent sur attributeHasChanged
          // pour vérifier un login par exemple. Et dans les cas où il est absent à la création
          // on voudra particulièrement le vérifier
          TestEntity.create(),
          TestEntity.create({nom: null}),
          TestEntity.create({nom: undefined})
        ].forEach((entity) => {
          expect(entity.attributeHasChanged('nom')).to.be.true
          expect(entity.attributeWas('nom')).to.be.null
        })
      })
    })

    describe('à la mise à jour', () => {
      let entity
      beforeEach(function (done) {
        TestEntity.create({nom: 'foobar'}).store((err, {oid}) => {
          if (err) return done(err)

          TestEntity.match('oid').equals(oid).grabOne((err, e) => {
            entity = e
            done(err)
          })
        })
      })

      it('permet de voir si le champ a changé', () => {
        expect(entity.attributeHasChanged('nom')).to.be.false
        entity.nom = 'foo'
        expect(entity.attributeHasChanged('nom')).to.be.true
        expect(entity.attributeWas('nom')).to.equal('foobar')
      })
    })
  })

  describe('EntityDefinition#validate', () => {
    beforeEach(function () {
      TestEntity = entities.define('TestEntity')

      TestEntity.validate(function (cb) {
        if (this.nom === 'foobar') return cb()
        cb(new Error('name is not foobar!'))
      })
    })

    describe('à la création', () => {
      it('valide la fonction - fail', (done) => {
        const entity = TestEntity.create({nom: 'foo'})
        entity.store((err) => {
          expect(err.message).to.equal('name is not foobar!')
          done()
        })
      })
      it('valide la fonction - success', (done) => {
        const entity = TestEntity.create({nom: 'foobar'})
        entity.store((err) => {
          expect(err).to.not.exist
          done()
        })
      })
    })

    describe('à la mise à jour', () => {
      let entity
      beforeEach(function (done) {
        TestEntity.create({nom: 'foobar'}).store((err, {oid}) => {
          if (err) return done(err)
          TestEntity.match('oid').equals(oid).grabOne((err, e) => {
            entity = e
            done(err)
          })
        })
      })
      it('valide la fonction - fail', (done) => {
        entity.nom = 'foo'
        entity.store((err) => {
          expect(err.message).to.equal('name is not foobar!')
          done()
        })
      })
    })
  })

  describe('EntityDefinition#validateOnChange', () => {
    let validationCalled
    let sharedValidatorCallCount
    beforeEach(function () {
      validationCalled = false
      sharedValidatorCallCount = 0
      TestEntity = entities.define('TestEntity')

      TestEntity.validateOnChange('nom', function (cb) {
        validationCalled = true
        if (this.nom === 'foobar') return cb()
        cb(new Error('name is not foobar!'))
      })
      // Parfois on voudra un même validateur sur plusieurs changement de valeur
      // (ex: externalMesh ou externalId a changé)
      const sharedValidator = function (cb) {
        sharedValidatorCallCount++
        cb()
      }
      TestEntity.validateOnChange('a', sharedValidator)
      TestEntity.validateOnChange('b', sharedValidator)
    })

    describe('à la création', () => {
      it('validate le champ', (done) => {
        const entity = TestEntity.create({nom: 'foo'})
        entity.store((err) => {
          expect(err.message).to.equal('name is not foobar!')
          done()
        })
      })
      it(`appelle un validateur commun qu'une seule fois même si les deux attributs ont changé`, (done) => {
        const entity = TestEntity.create({nom: 'foobar', a: 'a', b: 'b'})
        entity.store((err) => {
          expect(err).to.not.exist
          expect(sharedValidatorCallCount).to.equal(1)
          done()
        })
      })
    })

    describe('à la mise à jour', () => {
      let entity
      beforeEach(function (done) {
        TestEntity.create({nom: 'foobar'}).store((err, {oid}) => {
          if (err) return done(err)
          validationCalled = false
          sharedValidatorCallCount = 0
          TestEntity.match('oid').equals(oid).grabOne((err, e) => {
            entity = e
            done(err)
          })
        })
      })

      it('validate si le champ a changé', (done) => {
        entity.nom = 'foo'
        entity.store((err) => {
          expect(err.message).to.equal('name is not foobar!')
          done()
        })
      })

      it('ne validate pas si le champ ne change pas', (done) => {
        entity.prenom = 'foo'
        entity.store((err) => {
          expect(err).to.not.exist
          expect(validationCalled).to.be.false
          done()
        })
      })

      it(`appelle un validateur commun qu'une seule fois même si les deux attributs ont changé`, (done) => {
        entity.a = 'a'
        entity.b = 'b'
        entity.store((err) => {
          expect(err).to.not.exist
          expect(sharedValidatorCallCount).to.equal(1)
          done()
        })
      })
    })
  })

  describe('EntityDefinition#validateJsonSchema et Entity#isValid', function () {
    beforeEach(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.flush(() => {
        TestEntity.initialize(done)
      })
    })
    const testValidationError = (schema, data, expectedError, addKeywords = {}) => (done) => {
      TestEntity.validateJsonSchema(schema, addKeywords)
      const entity = TestEntity.create(data)

      entity.isValid((err) => {
        try {
          expect(err.errors.length).to.equal(1)
          expect(err.errors[0]).to.include(expectedError)

          done()
        } catch (e) {
          done(e)
        }
      })
    }

    const testValidationSuccess = (schema, data, addKeywords = {}) => (done) => {
      TestEntity.validateJsonSchema(schema, addKeywords)
      const entity = TestEntity.create(data)

      entity.isValid((err) => {
        expect(err).to.be.null
        done(err)
      })
    }

    describe('validation sans erreur', () => {
      it('si absence de schema', (done) => {
        const entity = TestEntity.create({test: 1})
        entity.isValid((err) => {
          expect(err).to.not.exist
          done()
        })
      })

      it('si schema conforme aux données', testValidationSuccess(
        // Schema
        {
          properties: {
            num: {type: 'number'},
            text: {type: 'string'}
          },
          required: [ 'num', 'text' ]
        },
        // Data
        {num: 1, text: 'hello'}
      ))
    })

    describe(`erreur de validation`, () => {
      // On teste quelques cas basiques
      it('si champ requis manquant', testValidationError(
        // Schema
        {
          properties: {num: {type: 'number'}},
          required: [ 'num' ],
          errorMessage: {
            required: {
              num: 'Paramètre num manquant' // on vérifie aussi la sucharge du message d'erreur
            }
          }
        },
        // Data
        {},
        // Expected error
        {message: `Paramètre num manquant`, dataPath: ''}
      ))

      it('si un champ en trop', testValidationError(
        // Schema
        {
          properties: {num: {type: 'number'}}
        },
        // Data
        {other: 'Hey?'},
        // Expected error
        {message: `ne doit pas contenir de propriétés additionnelles : "other"`, dataPath: ''}
      ))

      it('si type number incorrect', testValidationError(
        // Schema
        {
          properties: {num: {type: 'number'}},
          required: [ 'num' ],
          errorMessage: {
            properties: { // on vérifie aussi la sucharge du message d'erreur
              num: 'Num doit contenir un entier'
            }
          }
        },
        // Data
        {num: 'not a number'},
        // Expected error
        {message: 'Num doit contenir un entier', dataPath: '/num'}
      ))

      it('si type string incorrect', testValidationError(
        // Schema
        {
          properties: {text: {type: 'string'}}
        },
        // Data
        {text: 1},
        // Expected error
        {message: `doit être de type string`, dataPath: '/text'} // message d'erreur par défaut avec i18n ajv
      ))

      it('si custom keyword incorrect', testValidationError(
        // Schema
        {
          properties: {
            custom: {
              type: 'integer',
              customType: { expectedValue: 1 } // on teste le passage de paramètre au type
            }
          },
          errorMessage: {
            properties: { // on vérifie aussi la sucharge du message d'erreur
              custom: 'custom doit être égal à 1 !'
            }
          }
        },
        // Data
        {
          custom: 2
        },
        // Expected error
        {message: 'custom doit être égal à 1 !', dataPath: '/custom'},
        // Custom keyword validator
        {
          customType: {
            async: true,
            validate: (schema, data) => Promise.resolve(schema.expectedValue === data)
          }
        }
      ))
    })

    describe('required conditionel, par exemple sur un utilisateur', () => {
      const schemaUtilisateur = {
        properties: {
          nom: {type: 'string'},
          mail: {type: 'string'},
          type: { enum: ['prof', 'eleve'] },
          classe: {type: 'number'}
        },
        required: ['type', 'nom'],
        if: {properties: {type: { enum: ['prof'] }}},
        then: {required: ['mail']},
        else: {required: ['classe']}
      }

      it(`retourne une erreur si l'élève n'a pas de classe`, testValidationError(
        // Par exemple, un élève a des champs requis que n'a pas un prof
        // Schema
        schemaUtilisateur,
        // Data
        {nom: 'Foo', type: 'eleve'},
        {message: `requiert la propriété classe`, dataPath: ''} //
      ))

      it(`retourne une erreur si le prof n'a pas de mail`, testValidationError(
        // Par exemple, un élève a des champs requis que n'a pas un prof
        // Schema
        schemaUtilisateur,
        // Data
        {nom: 'Foo', type: 'prof'},
        {message: `requiert la propriété mail`, dataPath: ''} //
      ))

      it(`ne retourne pas d'erreur si le prof n'a pas de classe`, testValidationSuccess(
        // Par exemple, un élève a des champs requis que n'a pas un prof
        // Schema
        schemaUtilisateur,
        // Data
        {nom: 'Foo', type: 'prof', mail: 'aa@aa.com'}
      ))

      it(`valide quand même les autres champs`, testValidationError(
        // Par exemple, un élève a des champs requis que n'a pas un prof
        // Schema
        schemaUtilisateur,
        // Data
        {type: 'prof', mail: 'aa@aa.com'},
        // Expected errors
        {message: `requiert la propriété nom`, dataPath: ''}
      ))
    })

    describe('validation au store', () => {
      describe('sans schema', () => {
        it('ne lance pas de validation', (done) => {
          // On veut préserver ce comportement pour l'existant
          const entity = TestEntity.create({num: 'not a number'})

          entity.store((err) => {
            expect(err).to.be.null
            done()
          })
        })
      })

      describe('avec un schema', () => {
        beforeEach(() => {
          TestEntity.validateJsonSchema({
            properties: {
              num: {type: 'number'}
            },
            required: [ 'num' ]
          })
        })

        it(`lance une validation au store par défaut`, (done) => {
          const entity = TestEntity.create({num: 'not a number'})
          entity.store((err) => {
            expect(err.errors.length).to.equal(1)
            expect(err.errors[0].message).to.equal('doit être de type number')
            done()
          })
        })

        it('ne lance pas de validation si skipValidation est true sur la définition', (done) => {
          // On pourra utiliser cette fonctionalité pour une migration progressive : d'abord
          // vérifier que tout est correct avec isValid(), puis activer la validation au store
          TestEntity.setSkipValidation(true)

          const entity = TestEntity.create({num: 'not a number'})

          entity.store((err) => {
            expect(err).to.not.exist
            done()
          })
        })

        it('ne lance pas de validation si skipValidation est passé en option au store', (done) => {
          const entity = TestEntity.create({num: 'not a number'})

          entity.store({skipValidation: true}, (err) => {
            expect(err).to.be.null
            done()
          })
        })
      })
    })
  })
})
