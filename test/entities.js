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
  before(function (done) {
    this.timeout(60000)
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

  describe('_data', () => {
    beforeEach(function (done) {
      TestEntity = entities.define('TestEntity')
      TestEntity.flush((err) => {
        if (err) return done(err)
        TestEntity._initialize(done)
      })
    })

    it('contient un objet mongo', (done) => {
      flow()
        .seq(function () {
          TestEntity.create({oid: '1', test: 'a'}).store(this)
        })
        .seq(function () {
          TestEntity.getCollection().findOne({_id: '1'}, this)
        })
        .seq(function (result) {
          expect(result._data).to.be.an('object')
          expect(result._data.test).to.equal('a')
          this()
        })
        .done(done)
    })

    it('peut contenir un JSON pour la rétro-compatibilité', (done) => {
      // En version 2.2.17, _data contenait un JSON
      flow()
        .seq(function () {
          TestEntity.getCollection().insert({
            _id: '1',
            _data: JSON.stringify({test: 'a', oid: '1'})
          }, this)
        })
        .seq(function () {
          TestEntity.getCollection().findOne({_id: '1'}, this)
        })
        .seq(function (result) {
          // Objet mongo AVANT store...
          expect(result._data).to.equal('{"test":"a","oid":"1"}')

          TestEntity.match().grabOne(this)
        })
        .seq(function (entity) {
          // ...que l'on peut lire correctement comme entity
          expect(entity.test).to.equal('a')
          entity.store(this)
        })
        .seq(function () {
          TestEntity.getCollection().findOne({_id: '1'}, this)
        })
        .seq(function (result) {
          // Objet mongo APRES store, le json a été remplacé par un objet
          expect(result._data).to.be.an('object')
          expect(result._data.test).to.equal('a')
          this()
        })
        .done(done)
    })
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
        TestEntity._initialize(done)
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
        flow().seq(function () {
          TestEntity.create({}).store(this)
        }).seq(function (entity) {
          expect(entity.$loaded).to.equal('load-1')
          TestEntity.match().grabOne(this)
        }).seq(function (entity) {
          storedEntity = entity
          done()
        }).catch(done)
      })

      it('est appelé après un grab', () => {
        expect(storedEntity.$loaded).to.equal('load-2')
      })
      it('est appelé après le beforeStore', (done) => {
        expect(storedEntity.$loaded).to.equal('load-2')
        TestEntity.afterStore(function (next) {
          const entity = this
          // on a encore la valeur courante (si l'on veut faire des traitement concernant
          // les modifications opérées dans ce store)
          expect(entity.$loaded).to.equal('load-2')
          next()
          done()
        })
        storedEntity.store()
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
        TestEntity._initialize(done)
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

    it('enlève les attributs "null" ou "undefined" en bdd', (done) => {
      // on ne met pas de undefined dans le tableau car c'est converti en null par mongo
      const deepArray = [1, 2, 3, 'soleil', null]
      const deepDate = new Date()
      const deepFunction = () => 'hello'
      const deepRegexp = /foo/
      const entityData = {
        nonTemporaire: 1,
        nullValue: null,
        undefinedValue: undefined,
        child: {
          deepArray,
          deepDate,
          deepFunction,
          deepNull: null,
          deepNumber: 6,
          deepRegexp,
          deepUndefined: undefined
        }
      }
      const entity = TestEntity.create(entityData)

      flow()
        .seq(function () {
          entity.store(this)
        })
        .seq(function ({oid}) {
          TestEntity.match('oid').equals(oid).grabOne(this)
        })
        .seq(function (dbEntity) {
          // Test de l'entité provenant de la BDD
          expect(dbEntity.nonTemporaire).to.equal(1)

          expect(dbEntity).to.not.have.property('nullValue')
          expect(dbEntity).to.not.have.property('undefinedValue')
          expect(dbEntity.child).to.not.have.property('deepFunction')
          expect(dbEntity.child).to.not.have.property('deepNull')
          expect(dbEntity.child).to.not.have.property('deepUndefined')

          expect(dbEntity.child.deepArray).to.deep.equals(deepArray)
          // avec la serialisation / désérialisation mongo on perd l'égalité stricte d'objet Date
          expect(dbEntity.child.deepDate.toString()).to.equals(deepDate.toString())
          expect(dbEntity.child.deepNumber).to.equal(6)
          // idem pour regex
          expect(dbEntity.child.deepRegexp.source).to.equals(deepRegexp.source)

          // Vérifie que le store n'a pas modifié l'objet original
          expect(entity).to.have.property('nullValue')
          expect(entity).to.have.property('undefinedValue')
          expect(entity.child).to.have.property('deepFunction')
          expect(entity.child).to.have.property('deepUndefined')
          Object.keys(entityData).forEach(k => {
            expect(entity[k]).to.deep.equals(entityData[k])
          })

          this()
        })
        .done(done)
    })

    describe('.afterStore', () => {
      it(`est appelée avec un oid lors d'une création`, (done) => {
        // Cas d'utilisation principale du afterStore :
        // faire des opérations qui ont besoin de l'oid, identiques pour la création et la mise à jour
        const testEntity = TestEntity.create({})
        TestEntity.afterStore(function (next) {
          const entity = this
          expect(entity.oid).not.to.be.undefined
          Object.keys(testEntity).forEach(prop => {
            if ([].includes(prop.substr(0, 1))) return
            if (typeof testEntity[prop] === 'function') return
            expect(entity[prop]).to.deep.equals(testEntity[prop])
          })
          next()
          done()
        })
        testEntity.store()
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

  describe('EntityDefinition#count et countBy', () => {
    const saveOne = (data) => new Promise((resolve, reject) => {
      TestEntity.create(data).store((error, entity) => {
        if (error) return reject(error)
        resolve(entity)
      })
    })

    beforeEach(() => {
      TestEntity = entities.define('TestEntity')
      TestEntity.defineIndex('nom', 'string')
      const init = () => new Promise((resolve, reject) => {
        TestEntity.flush((err) => {
          if (err) return reject(err)
          TestEntity._initialize((err) => {
            if (err) return reject(err)
            resolve()
          })
        })
      })

      return init().then(() => Promise.all([{nom: 'foo'}, {nom: 'bar'}, {nom: 'foo'}].map(saveOne)))
    })

    it('count compte le nb d’entities', (done) => {
      TestEntity.count((error, nb) => {
        if (error) return done(error)
        expect(nb).to.equals(3)
        done()
      })
    })
    it('sans les softDeleted', (done) => {
      TestEntity.match().grabOne((error, entity) => {
        if (error) return done(error)
        entity.softDelete((error) => {
          if (error) return done(error)
          TestEntity.count((error, nb) => {
            if (error) return done(error)
            expect(nb).to.equals(2)
            done()
          })
        })
      })
    })
    it('countBy compte le nb d’entities par valeur d’index', (done) => {
      TestEntity.countBy('nom', (error, result) => {
        if (error) return done(error)
        expect(result.foo).to.equals(2)
        expect(result.bar).to.equals(1)
        done()
      })
    })
    it('sans les softDeleted', (done) => {
      TestEntity.match('nom').equals('bar').grabOne((error, entity) => {
        if (error) return done(error)
        entity.softDelete((error) => {
          if (error) return done(error)
          TestEntity.countBy('nom', (error, result) => {
            if (error) return done(error)
            expect(result.foo).to.equals(2)
            expect(result.bar).to.be.undefined
            done()
          })
        })
      })
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

  describe('EntityDefinition#trackAttributes', () => {
    it('affecte bien chaque attribut', (done) => {
      TestEntity = entities.define('TestEntity')
      TestEntity.trackAttributes(['nom', 'prenom'])
      TestEntity.create({prenom: 'foo', nom: 'bar'}).store((err, entity) => {
        if (err) return done(err)
        entity.nom = 'baz'
        expect(entity.attributeHasChanged('prenom')).to.be.false
        expect(entity.attributeHasChanged('nom')).to.be.true
        done()
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
        TestEntity._initialize(done)
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

      describe('si données conforme au schema', () => {
        const schema = {
          properties: {
            bool: {type: 'boolean'},
            date: {instanceof: 'Date'},
            num: {type: 'number'},
            mixed: {
              oneof: [
                {type: 'string'},
                {type: 'number'},
                {instanceof: 'Date'}
              ]
            },
            text: {type: 'string'}
          },
          required: [ 'num', 'text' ]
        }
        const date = new Date()
        it('données complètes', testValidationSuccess(schema, {bool: true, date, num: 1, mixed: 'foo', text: 'hello'}))
        it('données complètes mais falsy', testValidationSuccess(schema, {bool: false, date, num: 0, mixed: 0, text: ''}))
        it('sans donnée facultative', testValidationSuccess(schema, {num: 1, text: 'hello'}))
        it('avec donnée facultative null', testValidationSuccess(schema, {bool: null, date: null, num: 1, mixed: date, text: 'hello'}))
        it('avec donnée facultative undefined', testValidationSuccess(schema, {num: 1, date: undefined, mixed: undefined, text: 'hello'}))
      })
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
              // on vérifie aussi la sucharge du message d'erreur
              num: 'Paramètre num manquant'
            }
          }
        },
        // Data
        {},
        // Expected error
        {message: 'Paramètre num manquant (oid: undefined value: {})', dataPath: ''}
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
        {message: 'Num doit contenir un entier (oid: undefined value: "not a number")', dataPath: '/num'}
      ))

      it('si type string incorrect', testValidationError(
        // Schema
        {
          properties: {text: {type: 'string'}}
        },
        // Data
        {text: 1},
        // Expected error
        {message: 'doit être de type string (oid: undefined value: 1)', dataPath: '/text'} // message d'erreur par défaut avec i18n ajv
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
        {message: 'custom doit être égal à 1 ! (oid: undefined value: 2)', dataPath: '/custom'},
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
        {message: 'requiert la propriété classe (oid: undefined value: {"nom":"Foo","type":"eleve"})', dataPath: ''} //
      ))

      it(`retourne une erreur si le prof n'a pas de mail`, testValidationError(
        // Par exemple, un élève a des champs requis que n'a pas un prof
        // Schema
        schemaUtilisateur,
        // Data
        {nom: 'Foo', type: 'prof'},
        {message: 'requiert la propriété mail (oid: undefined value: {"nom":"Foo","type":"prof"})', dataPath: ''} //
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
        {message: 'requiert la propriété nom (oid: undefined value: {"type":"prof","mail":"aa@aa.com"})', dataPath: ''}
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

        it(`lance une validation au store par défaut (et ne store pas si ça passe pas)`, (done) => {
          const entity = TestEntity.create({num: 'not a number'})
          entity.store((err, entityStored) => {
            expect(err.errors.length).to.equal(1)
            expect(err.errors[0].message).to.match(/^doit être de type number/)
            expect(entityStored).to.equal(undefined)
            done()
          })
        })
        it(`store si ça valide`, (done) => {
          const entity = TestEntity.create({num: 42})
          entity.store((err, entityStored) => {
            expect(err).to.not.exist
            expect(entityStored).to.have.property('num')
            expect(entityStored.num).to.equals(42)
            done()
          })
        })

        it('ne lance pas de validation si skipValidation est true sur la définition (et store)', (done) => {
          // On pourra utiliser cette fonctionalité pour une migration progressive : d'abord
          // vérifier que tout est correct avec isValid(), puis activer la validation au store
          TestEntity.setSkipValidation(true)

          const entity = TestEntity.create({num: 'not a number'})

          entity.store((err, entityStored) => {
            expect(err).to.not.exist
            expect(entityStored).to.have.property('num')
            expect(entityStored.num).to.equals('not a number')
            done()
          })
        })

        it('ne lance pas de validation si skipValidation est passé en option au store (et store)', (done) => {
          const entity = TestEntity.create({num: 'not a number'})

          entity.store({skipValidation: true}, (err, entityStored) => {
            expect(err).to.be.null
            expect(entityStored).to.have.property('num')
            expect(entityStored.num).to.equals('not a number')
            done()
          })
        })
      })
    })
  })
})
