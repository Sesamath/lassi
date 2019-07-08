/* eslint-env mocha */
'use strict'
const flow = require('an-flow')
const chai = require('chai')
const {expect} = chai
const sinonChai = require('sinon-chai')

const {quit, setup} = require('./init')

chai.use(sinonChai)

let TestEntity

describe('Test entities-queries', function () {
  before('Connexion à Mongo et initialisation des entités', function (done) {
    // Evite les erreurs de timeout sur une machine lente (ou circleCI)
    this.timeout(60000)
    flow().seq(function () {
      setup(this)
    }).seq(function (Entity) {
      TestEntity = Entity
      done()
    }).catch(done)
  })

  after('nettoie en sortant', quit)

  // Normalement déjà testé par entities-indexes, mais ça mange pas de pain de le vérifier de nouveau
  // dans cette entity plus complète
  it('A créé les index demandés', function (done) {
    flow().seq(function () {
      TestEntity.getCollection().listIndexes().toArray(this)
    }).seq(function (indexes) {
      // Pour visualiser les index rapidement
      // console.log('index de la collection', indexes)
      // nos indexes + _id_ toujours mis par mongo + __deletedAt ajouté par lassi
      expect(indexes).to.have.lengthOf(19)
      // on ne check que les notres
      const testIndexes = indexes.filter(i => !['_id_', '__deletedAt'].includes(i.name))
      expect(testIndexes).to.have.lengthOf(17)
      this(null, testIndexes)
    }).seqEach(function (index) {
      expect(index.name).to.match(/^entity_index_/)
      this()
    }).done(done)
  })

  it('Indexe un boolean null|undefined comme null, falsy comme false et le reste true - verifie isNull|isNotNull', function (done) {
    const entities = [
      {b: true, s: 'boolean true'},
      {b: null, s: 'boolean null'},
      {b: undefined, s: 'boolean undefined'},
      {b: false, s: 'boolean false'},
      {b: 0, s: 'boolean zéro'},
      {b: '', s: 'boolean empty string'},
      {b: 42, s: 'boolean truthy int'},
      {b: 'foo', s: 'boolean truthy string'},
      {b: {}, s: 'boolean truthy obj'},
      {b: new Date(), s: 'boolean truthy date'}
    ]
    flow(entities).seqEach(function (entity) {
      TestEntity.create(entity).store(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(10)
      TestEntity.match('b').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      expect(entities[0].s).to.equal('boolean null')
      expect(entities[1].s).to.equal('boolean undefined')
      TestEntity.match('b').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(8)
      expect(entities[0].s).to.equal('boolean true')
      expect(entities[1].s).to.equal('boolean false')
      expect(entities[2].s).to.equal('boolean zéro')
      expect(entities[3].s).to.equal('boolean empty string')
      expect(entities[4].s).to.equal('boolean truthy int')
      expect(entities[5].s).to.equal('boolean truthy string')
      expect(entities[6].s).to.equal('boolean truthy obj')
      expect(entities[7].s).to.equal('boolean truthy date')
      TestEntity.match('b').equals(true).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(5)
      expect(entities[0].s).to.equal('boolean true')
      expect(entities[1].s).to.equal('boolean truthy int')
      expect(entities[2].s).to.equal('boolean truthy string')
      expect(entities[3].s).to.equal('boolean truthy obj')
      expect(entities[4].s).to.equal('boolean truthy date')
      TestEntity.match('b').equals(false).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(3)
      expect(entities[0].s).to.equal('boolean false')
      expect(entities[1].s).to.equal('boolean zéro')
      expect(entities[2].s).to.equal('boolean empty string')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe un integer null|undefined comme null, 0 comme 0, false comme 0 - verifie isNull|isNotNull', function (done) {
    const entities = [
      {i: null, s: 'int null'},
      {i: undefined, s: 'int undefined'},
      {i: 42, s: 'int'},
      {i: 0, s: 'int zéro'},
      {i: false, s: 'int false'}
    ]
    flow(entities).seqEach(function (entityData) {
      TestEntity.create(entityData).store(this)
    }).seq(function () {
      TestEntity.match('i').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      expect(entities[0].s).to.equal('int null')
      expect(entities[1].s).to.equal('int undefined')
      TestEntity.match('i').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(3)
      expect(entities[0].s).to.equal('int')
      expect(entities[0].i).to.equal(42)
      expect(entities[1].s).to.equal('int zéro')
      expect(entities[1].i).to.equal(0)
      expect(entities[2].s).to.equal('int false')
      expect(entities[2].i).to.equal(false) // y'a un cast sur l'index mais pas sur la valeur
      TestEntity.match('i').equals(0).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      expect(entities[0].s).to.equal('int zéro')
      expect(entities[1].s).to.equal('int false')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe une string null|undefined comme null - verifie isNull|isNotNull', function (done) {
    const entities = [
      {s: '', i: 1},
      {s: null, i: 2},
      {s: undefined, i: 3},
      {s: 'une string', i: 4}
    ]
    flow(entities).seqEach(function (entityData) {
      TestEntity.create(entityData).store(this)
    }).seq(function () {
      TestEntity.match('s').isNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      // (mongo ne distingue pas null|undefined, lassi ne les stocke pas et les deux remontent undefined)
      expect(entities[0].s).to.equal(undefined) // cast sur l'index, pas la valeur
      expect(entities[0].i).to.equal(2)
      expect(entities[1].s).to.equal(undefined)
      expect(entities[1].i).to.equal(3)
      // on cherche aussi les notNull
      TestEntity.match('s').isNotNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      expect(entities[0].s).to.equal('')
      expect(entities[0].i).to.equal(1)
      expect(entities[1].s).to.equal('une string')
      expect(entities[1].i).to.equal(4)
      // et on purge avant de sortir
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe une date null|undefined comme null - verifie isNull|isNotNull', function (done) {
    const entities = [
      {d: null, s: 'date null'},
      {d: undefined, s: 'date undefined'},
      {d: new Date(), s: 'date'},
      {d: '2017-01-02', s: 'date string'}
    ]
    flow(entities).seqEach(function (entityData) {
      TestEntity.create(entityData).store(this)
    }).seq(function () {
      TestEntity.match('d').isNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      expect(entities[0].s).to.equal('date null')
      expect(entities[1].s).to.equal('date undefined')
      TestEntity.match('d').isNotNull().sort('oid', 'asc').grab(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(2)
      expect(entities[0].s).to.equal('date')
      expect(entities[1].s).to.equal('date string')
      TestEntity.match().purge(this)
    }).done(done)
  })

  it('Indexe un tableau de booleans', function (done) {
    let entities = [
      {bArray: [true], s: 'boolean true', i: 0},
      {bArray: [null], s: 'boolean null', i: 1},
      {bArray: [undefined], s: 'boolean undefined', i: 2},
      {bArray: [false], s: 'boolean false', i: 3},
      {bArray: [0], s: 'boolean zéro', i: 4},
      {bArray: [''], s: 'boolean empty string', i: 5},
      {bArray: [42], s: 'boolean truthy int', i: 6},
      {bArray: ['foo'], s: 'boolean truthy string', i: 7},
      {bArray: [{}], s: 'boolean truthy obj', i: 8},
      {bArray: [new Date()], s: 'boolean truthy date', i: 9},
      {bArray: [], s: 'boolean empty', i: 10}
    ]
    flow(entities).seqEach(function (entity) {
      TestEntity.create(entity).store(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(11)

      // filtre null
      TestEntity.match('bArray').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equals('1,2')
      entities.forEach(e => {
        // dans les index, les undefined sont sauvegardés et transformés en null par mongo (il distingue pas),
        // (mais dans les valeurs ils sont pas sauvegardés et remontent undefined)
        if (e.i === 2) expect(e.bArray).to.deep.equal([null])
        else expect(e.bArray).to.deep.equal(entities[e.i].bArray, `Pb avec ${e.s}`)
      })

      // filtre notNull
      TestEntity.match('bArray').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equals('0,3,4,5,6,7,8,9,10')

      // filtre true
      TestEntity.match('bArray').equals(true).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equals('0,6,7,8,9')

      // false
      TestEntity.match('bArray').equals(false).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equals('3,4,5')

      // on purge avant la prochaine série
      TestEntity.match().purge(this)
    }).seq(function () {
      // on recommence avec un tableau à plusieurs boolean
      entities = [
        {bArray: [true, 42, true], i: 1},
        {bArray: [null, false], i: 2},
        {bArray: [false, undefined], i: 3},
        {bArray: [true, false], i: 4},
        {bArray: [true, null, false, undefined, true], i: 5},
        {bArray: [null, undefined], i: 6},
        {bArray: [], i: 7}
      ]
      this(null, entities)
    }).seqEach(function (entity) {
      TestEntity.create(entity).store(this)
    }).seq(function (entities) {
      expect(entities.length).to.equal(7)
      TestEntity.match('bArray').isNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equal('2,3,5,6')
      TestEntity.match('bArray').isNotNull().sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equal('1,4,7')
      TestEntity.match('bArray').equals(false).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equal('2,3,4,5')
      TestEntity.match('bArray').equals(true).sort('oid').grab(this)
    }).seq(function (entities) {
      expect(entities.map(e => e.i).join(',')).to.equal('1,4,5')
      TestEntity.match().purge(this)
    }).done(done)
  })

  describe('options.normalizer', function () {
    before('création d’une entité', function (done) {
      TestEntity.create({
        controlled: 'FooBar',
        controlledTyped: 'bAz'
      }).store(done)
    })
    after('purge', function (done) {
      TestEntity.match().purge(done)
    })

    it('conserve la valeur initiale dans data et normalise l’index', function (done) {
      flow().seq(function () {
        TestEntity.getCollection().find().sort({'_id': 1}).toArray(this)
      }).seq(function (docs) {
        expect(docs).to.have.length(1)
        const doc = docs[0]
        expect(doc._data.controlled).to.equals('FooBar')
        expect(doc.controlled).to.equals('foobar')
        expect(doc._data.controlledTyped).to.equals('bAz')
        expect(doc.controlledTyped).to.equals('baztyped')
        // on fait un grab standard
        TestEntity.match('controlled').grabOne(this)
      }).seq(function (entity) {
        expect(entity.controlled).to.equals('FooBar')
        done()
      }).catch(done)
    })

    it('s’applique sur l’argument de .equals()', function (done) {
      flow().seq(function () {
        TestEntity.match('controlled').equals('fooBar').grabOne(this)
      }).seq(function (entity) {
        expect(entity.controlled).to.equals('FooBar')
        expect(entity.controlledTyped).to.equals('bAz')
        TestEntity.match('controlledTyped').equals('BazTYPED').grabOne(this)
      }).seq(function (entity) {
        expect(entity.controlled).to.equals('FooBar')
        expect(entity.controlledTyped).to.equals('bAz')
        done()
      }).catch(done)
    })
  })

  describe('index sans type ne remonte que les égalités strictes', function () {
    const datas = [
      {whatever: 'FooBar'},
      {whatever: 42},
      {whatever: '42'},
      {whatever: false},
      {whatever: 0},
      {whatever: null},
      {whatever: undefined},
      {whatever: []},
      {whatever: [42]}
    ].map((item, index) => {
      item.i = index
      return item
    })
    before('création d’entités', function (done) {
      flow(datas).seqEach(function (data) {
        TestEntity.create(data).store(this)
      }).done(done)
    })
    after('purge', function (done) {
      TestEntity.match().purge(done)
    })

    // les valeurs null et undefined prennent la valeur undefined et un index null

    it('tous remontent en cherchant sur cet index', function (done) {
      flow().seq(function () {
        TestEntity.match().grab(this)
      }).seq(function (entities) {
        // console.log('e', entities.map(e => ({w: e.whatever, i: e.i})))
        expect(entities).to.have.length(datas.length)
        TestEntity.match('whatever').sort('i').grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(datas.length)
        datas.forEach(({whatever: original, i}, index) => {
          expect(index).to.equals(i)
          const expected = (original === null) ? undefined : original
          if (Array.isArray(expected)) expect(entities[index].whatever).to.deep.equals(expected, `Pb sur le n° ${i}`)
          else expect(entities[index].whatever).to.equals(expected, `Pb sur le n° ${i}`)
        })
        done()
      }).catch(done)
    })

    it('isNull() remonte null|undefined', function (done) {
      flow().seq(function () {
        TestEntity.match('whatever').isNull().sort('i').grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(2)
        entities.forEach(e => expect(e.whatever).to.equals(undefined))
        done()
      }).catch(done)
    })

    it('distingue string & number', function (done) {
      flow().seq(function () {
        TestEntity.match('whatever').equals('42').grab(this)
      }).seq(function (entities) {
        expect(entities).to.have.length(1)
        expect(entities[0].whatever).to.equals('42')
        TestEntity.match('whatever').equals(42).grab(this)
      }).seq(function (entities) {
        expect(entities[0].whatever).to.equals(42)
        done()
      }).catch(done)
    })
  })

  describe('NaN throw', function () {
    it('sur un index integer', function () {
      expect(TestEntity.create({i: NaN}).store).to.throw()
    })
    it('sur un tableau d’integer', function () {
      expect(TestEntity.create({iArray: [1, NaN]}).store).to.throw()
    })
    it('sur un champ non typé', function () {
      expect(TestEntity.create({whatever: NaN}).store).to.throw()
    })
    it('string vide sur champ typé number devient NaN et throw', function () {
      expect(TestEntity.create({i: ''}).store).to.throw()
    })
  })

  describe('undefined|null ne deviennent pas NaN', function () {
    const datas = [
      {i: 0, s: '0'},
      {i: 42, s: '1'},
      {i: null, s: '2'},
      {iArray: [42], s: '3'},
      {iArray: [42, null], s: '4'},
      {iArray: [undefined], s: '5'},
      {iArray: [null], s: '6'},
      {iArray: [null, 42, undefined], s: '7'},
      {iArray: [0], s: '8'}
    ]
    before('création d’entités', function (done) {
      flow(datas).seqEach(function (data) {
        TestEntity.create(data).store(this)
      }).done(done)
    })

    it('sur un champ integer', function (done) {
      flow().seq(function () {
        TestEntity.match('i').isNull().sort('s').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.s).join(',')).to.equals('2,3,4,5,6,7,8')
        entities.forEach(e => expect(e.i).to.equals(undefined, `Pb avec ${e.s}`))

        // et les autres
        TestEntity.match('i').isNotNull().sort('s').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.s).join(',')).to.equals('0,1')
        entities.forEach(e => expect(e.i).to.equals(datas[e.s].i))
        done()
      }).catch(done)
    })

    it('sur un tableau d’integer', function (done) {
      flow().seq(function () {
        TestEntity.match('iArray').isNull().sort('s').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.s).join(',')).to.equals('0,1,2,4,5,6,7')
        // et on veut que les valeurs restent inchangées (sauf undefined qui devient null)
        entities.forEach(e => {
          const expected = datas[e.s].iArray
            ? datas[e.s].iArray.map(elt => elt === undefined ? null : elt)
            : undefined
          expect(e.iArray).to.deep.equals(expected, `Pb avec ${e.s}`)
        })

        // on passe au complément
        TestEntity.match('iArray').isNotNull().sort('s').grab(this)
      }).seq(function (entities) {
        expect(entities.map(e => e.s).join(',')).to.equals('3,8')
        entities.forEach(e => expect(e.iArray).to.deep.equals(datas[e.s].iArray, `Pb avec ${e.s}`))
        done()
      }).catch(done)
    })
  })

  describe('isEmpty retrouve les tableaux vides', function () {
    const datas = []
    ;[null, undefined, true, false, 'foo', 42, 0, '', -1].forEach(v => {
      datas.push({bArray: [v]})
      datas.push({sArray: [v]})
    })
    // pour integer faut pas de NaN
    ;[null, undefined, 42, 0, -1].forEach(v => {
      datas.push({iArray: [v]})
    })
    // une date
    datas.push({dArray: [new Date()]})
    // on ajoute un array vide à chacun
    datas.push({bArray: [], s: 'bArray vide'})
    datas.push({dArray: [], s: 'dArray vide'})
    datas.push({iArray: [], s: 'iArray vide'})
    datas.push({sArray: [], s: 'sArray vide'})

    before('création d’entités', function (done) {
      flow(datas).seqEach(function (data) {
        TestEntity.create(data).store(this)
      }).done(done)
    })

    ;[
      {field: 'bArray', type: 'boolean'},
      {field: 'dArray', type: 'date'},
      {field: 'iArray', type: 'integer'},
      {field: 'sArray', type: 'string'}
    ].forEach(({field, type}) => {
      it(`sur un tableau de ${type}`, function (done) {
        TestEntity.match(field).isEmpty().grab((error, entities) => {
          if (error) return done(error)
          expect(entities).to.have.length(1)
          expect(entities[0].s).to.equals(`${field} vide`)
          done()
        })
      })
    })
  })
})
