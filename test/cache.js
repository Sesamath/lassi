/* eslint-env mocha */
'use strict'

const assert = require('assert')
const chai = require('chai')
const {expect} = chai
const flow = require('an-flow')
const redis = require('redis')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const log = require('an-log')('$cache')
log.setLogLevel('warning')

chai.use(sinonChai)

const $settings = {
  get: (path, defaultValue) => defaultValue
}
const $cacheFactory = require('../source/services/cache')

const allValues = new Map()
const falsyValues = {
  undef: undefined,
  null: null,
  zero: 0,
  false: false,
  emptyString: '',
  nan: NaN
}

const truthyValues = {
  true: true,
  foo: 42,
  bar: 'baz',
  baz: -1,
  obj: {foo:'bar', zero: 0, num: 42, bool: true, func: function() { return 1 }, funcArrow: () => 1},
  // JSON.stringify transforme les undefined en null dans un array, on le vérifie pas
  array: ['un', 2, null, 'kat', '', true, false, {a: 1}]
}
const expectedObjectValues = {foo:'bar', zero: 0, num: 42, bool: true} // on ne doit pas conserver la function

const values1 = Object.assign({}, truthyValues, falsyValues)
Object.keys(values1).forEach(key => allValues.set(key, values1[key]))

// Même valeurs en ajoutant 2 à chaque nom de propriété
const values2 = {}
Object.keys(values1).forEach(key => {
  const newKey = key + '2'
  values2[newKey] = values1[key]
  allValues.set(newKey, values2[newKey])
})
const nbRealValues = Array.from(allValues.values()).filter(value => ![null, NaN, undefined].includes(value)).length

describe('$cache', () => {
  let $cache
  const initCache = () => {
    $cache = $cacheFactory($settings)
  }
  const refreshCache = (done) => {
    initCache()
    $cache.setup(done)
  }
  const resetCache = (done) => {
    initCache()
    $cache.setup((error) => (error ? done(error) : $cache.purge(done)))
  }

  before(() => sinon.stub(console, 'error'))
  after(() => console.error.restore())

  describe('setup', () => {
    beforeEach(initCache)

    it('plante avec des settings foireux', () => {
      const lazyGet = $settings.get
      $settings.get = () => 'ooops'
      const $cacheFoireux = $cacheFactory($settings)
      expect($cacheFoireux.setup).to.throw(Error)
      expect($cacheFoireux.getRedisClient).to.throw(Error)
      $settings.get = lazyGet
    })

    it('râle si on lui donne aucun settings mais s’initialise avec ses valeurs par défaut', (done) => {
      $cache.setup((error) => {
        if (error) return done(error)
        // anLog utilise console.error pour warning
        expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/should have prefix property/))
        expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/host not defined in settings/))
        expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/port not defined in settings/))
        expect(console.error).to.have.been.calledThrice
        expect($cache.getRedisClient).not.to.throw(Error)
        done()
      })
    })
  })

  describe('getRedisClient', () => {
    beforeEach(initCache)

    it('throw si le setup n’est pas appelé avant', () => {
      expect($cache.getRedisClient).to.throw(Error)
    })

    it('retourne qqchose qui ressemble à vrai client redis après setup', (done) => {
      $cache.setup((error) => {
        if (error) return done(error)
        const client = $cache.getRedisClient()
        expect(!client).to.be.false
        expect(client).to.respondTo('get')
        expect(client).to.respondTo('set')
        expect(client).to.respondTo('flushdb')
        expect(client).to.respondTo('keys')
        expect(client).to.respondTo('del')
        client.set('foo', 'bar', 'EX', 1, (error) => {
          if (error) return done(error)
          client.get('foo', (error, value) => {
            if (error) return done(error)
            expect(value).to.equals('bar')
            done()
          })
        })
      })
    })
  })
  describe('avec un $cache initialisé et vide', () => {
    // pour être vraiment indépendant, il faudrait avoir un client redis séparé
    // utilisant directement le module redis, mais on peut pas utiliser flushdb ou flushall
    // car on veut pas purger tout redis, seulement nos préfixes, faudrait alors
    // recoder ici l'équivalent de $cache.purge…
    before(resetCache)

    describe('set, get & keys', () => {
      beforeEach(refreshCache)

      it('set affecte des valeur avec callback', (done) => {
        let i = 0
        const ttl = 10
        const ttlLow = 0.2
        const ttlHigh = 48 * 3600

        console.error.resetHistory()
        // avec des callback
        flow(Object.keys(values1)).seqEach(function (prop) {
          i++
          if (i === 1) $cache.set(prop, values1[prop], ttlLow, this)
          else if (i === 2) $cache.set(prop, values1[prop], ttlHigh, this)
          else if (i === 3) $cache.set(prop, values1[prop], 'foo', this)
          // un ttl sur 2 pour le reste
          else if (i % 2) $cache.set(prop, values1[prop], this)
          else $cache.set(prop, values1[prop], ttl, this)
        }).seq(function (results) {
          results.forEach(result => expect(result).to.equals('OK'))
          expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(RegExp(`ttl ${ttlLow} too low`)))
          expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(RegExp(`ttl ${ttlHigh} too high`)))
          expect(console.error).to.have.been.calledWith(sinon.match.any, sinon.match.any, sinon.match(/ttl must be a number/))
          expect(console.error).to.have.been.calledThrice
          done()
        }).catch(done)
      })

      it('set affecte des valeurs avec promise', (done) => {
        let i = 0
        const ttl = 2
        const promises = Object.keys(values2).map(p => (i++ % 2) ? $cache.set(p, values2[p]) : $cache.set(p, values2[p], ttl))
        Promise.all(promises).then(data => done()).catch(done)
      })

      it('get retourne null pour une clé absente, avec cb', (done) => {
        $cache.get('notSet', function (error, value) {
          if (error) return done(error)
          expect(value).to.equals(null, 'Pb avec key not set')
          done()
        })
      })

      it('get retourne null pour une clé absente, avec promise', (done) => {
        $cache.get('notSet').then(value => {
          expect(value).to.equals(null, 'Pb avec key not set')
          done()
        }).catch(done)
      })

      it('get retourne les valeurs précédentes avec cb (avec null pour undefined et NaN)', (done) => {
        // on parse les clés de values2
        flow(Object.keys(values2)).seqEach(function (key) {
          const nextGet = this
          $cache.get(key, function (error, value) {
            if (error) return done(error)
            try {
              if (['undef2', 'nan2', 'null2'].includes(key)) expect(value).to.equals(null, `Pb avec ${key}`)
              else if (key === 'obj2') expect(value).to.deep.equals(expectedObjectValues, `Pb avec ${key}`)
              else if (typeof value === 'object') expect(value).to.deep.equals(values2[key], `Pb avec ${key}`)
              else expect(value).to.equals(values2[key], `Pb avec ${key}`)
            } catch (e) { done(e); throw e}
            nextGet()
          })
        }).empty().done(done)
      })

      it('get retourne les valeurs précédentes avec promise (avec null pour undefined et NaN)', (done) => {
        // on parse les clés de values1
        flow(Object.keys(values1)).seqEach(function (key) {
          const nextGet = this
          $cache.get(key)
            .then(value => {
              if (['undef', 'nan', 'null'].includes(key)) expect(value).to.equals(null, `Pb avec ${key}`)
                // pour serviceCache JSON vire les méthodes, sinon faudrait comparer à
              else if (key === 'obj') expect(value).to.deep.equals(expectedObjectValues, `Pb avec ${key}`)
              else if (typeof value === 'object') expect(value).to.deep.equals(values1[key], `Pb avec ${key}`)
              else expect(value).to.equals(values1[key], `Pb avec ${key}`)
              nextGet()
            })
            .catch(done)
        }).done(done)
      })

      // keys
      const expected = Array.from(allValues.keys())
        .filter(k => !['null', 'null2', 'undef', 'undef2', 'nan', 'nan2'].includes(k))
        .sort()
      it('keys retourne toutes les clés avec cb (sauf celles contenant null, undefined et NaN)', (done) => {
        $cache.keys('*', function (error, keys) {
          if (error) return done(error)
          expect(keys.sort()).to.deep.equals(expected)
          done()
        })
      })
      it('keys retourne toutes les clés avec promise (sauf celles contenant null, undefined et NaN)', (done) => {
        $cache.keys('*').then(keys => {
          expect(keys.sort()).to.deep.equals(expected)
          done()
        }).catch(done)
      })
    })

    describe('purge', () => {
      beforeEach(refreshCache)

      it('vire tout (cb)', (done) => {
        $cache.purge(function (error, nb) {
          if (error) return done(error)
          expect(nb).to.equals(nbRealValues)
          $cache.keys('*', function (error, keys) {
            if (error) return done(error)
            expect(keys).to.deep.equals([])
            done()
          })
        })
      })

      it('vire tout (promise)', () => {
        // faut remplir avant…
        const promises = []
        allValues.forEach((value, key) => promises.push($cache.set(key, value)))
        return Promise.all(promises)
          .then(() => $cache.purge())
          .then(nb => {
            expect(nb).to.equals(nbRealValues)
            return $cache.keys('*')
          }).then(keys => expect(keys).to.deep.equals([]))
      })
    })

    describe('ttl', function () {
      before(resetCache)

      this.timeout(3500)
      // set 3 valeurs avec 1, 2s et 3s
      before(() => Promise.all([
        $cache.set('foo', 42, 1),
        $cache.set('bar', 43, 2),
        $cache.set('baz', 44, 3)
      ]))

      it('vire les clés après les ttl fixés (1, 2 et 3s)', () => {
        /**
         * Retourne une promesse résolue après delay ms
         * @private
         * @param {number} delay
         */
        const resolveAfter = (delay) => new Promise((resolve) => {
          setTimeout(() => resolve(), delay)
        })
        const fetchAll = () => Promise.all([
          $cache.get('foo'),
          $cache.get('bar'),
          $cache.get('baz'),
        ])
        // go
        return fetchAll()
          .then(values => {
            expect(values).to.deep.equals([42, 43, 44])
            return resolveAfter(1100).then(fetchAll)
          }).then(values => {
            expect(values).to.deep.equals([null, 43, 44])
            return resolveAfter(1000).then(fetchAll)
          }).then(values => {
            expect(values).to.deep.equals([null, null, 44])
            return resolveAfter(500).then(fetchAll)
          }).then(values => {
            expect(values).to.deep.equals([null, null, 44])
            return resolveAfter(500).then(fetchAll)
          }).then(values => {
            expect(values).to.deep.equals([null, null, null])
          })
      })
    })
  })
})
