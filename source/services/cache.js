'use strict'
// Pour la version avec cacheManager, voir la version 2.1.23 (ou antérieure)
// RedisEngine a été ajouté par le commit 67be1f2 puis fusionné ici
const log = require('an-log')('$cache')
// @see http://redis.js.org/
const redis = require('redis')
const {parse, stringify} = require('sesajstools')

/**
 * ttl par défaut (pour set si non fourni)
 * @type {number}
 */
const TTL_DEFAULT = 600 // 10 min
/**
 * ttl max (si un nb plus élevé est fourni il sera ramené à cette valeur)
 * @type {number}
 */
const TTL_MAX = 24 * 3600 // 24H

const CONNECT_TIMEOUT_DEFAULT = 3000 // 3s c'est déjà bcp

/**
 * Transforme un appel sans callback en promise
 * @private
 * @param {function} fn sera appelée avec (...args, cb) et cb attendra (error, data) pour rejeter ou résoudre la promesse
 * @param {*} ...args Les arguments à passer à fn, on ajoutera cb en dernier
 * @return {Promise}
 */
function promisify (fn, ...args) {
  return new Promise((resolve, reject) => {
    args.push((error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
    fn(...args)
  })
}

module.exports = function ($settings) {
  /**
   * Retourne le connect_timeout calculé par un éventuel $cache.redis.retry_strategy, ou $cache.redis.connect_timeout ou CONNECT_TIMEOUT_DEFAULT
   * @private
   * @return {Number} timeout en ms
   */
  function getFirstConnectTimeout () {
    const retry_strategy = $settings.get('$cache.redis.retry_strategy')
    if (typeof retry_strategy === 'function') return retry_strategy({attempt: 1})
    return $settings.get('$cache.redis.connect_timeout', CONNECT_TIMEOUT_DEFAULT)
  }

  // une seule instance d'un seul client
  let redisClient
  let redisPrefix
  const notSetError = new Error('$cache.setup has failed (or wasn’t called)')

  /**
   * Retourne une erreur (pas de client)
   * @private
   * @param {function} [cb]
   * @return {Promise.reject|undefined} Promise si cb absent
   */
  const notSet = (cb) => (cb ? cb(notSetError) : Promise.reject(notSetError))

  /**
   * Efface une valeur du cache
   * @param {string} key
   * @param {cacheDeleteCallback} [cb]
   * @return {Promise} qui wrap cb si fourni
   */
  function del (key, cb) {
    if (!redisClient) return notSet(cb)
    if (!cb) return promisify(del, key)
    redisClient.del(key, cb)
  }

  /**
   * Récupère une valeur du cache (absent, undefined, null et NaN renvoient tous null)
   * @param {string} key
   * @param {cacheGetCallback} [cb]
   * @return {Promise} qui wrap cb si fourni
   */
  function get (key, cb) {
    if (!redisClient) return notSet(cb)
    // faut distinguer ici car on doit parser le retour async du get natif
    if (!cb) return promisify(get, key)
    redisClient.get(key, (error, value) => {
      if (error) cb(error)
      else if (value) cb(null, parse(value))
      else cb(null, value)
    })
  }

  /**
   * Retourne le client redis original, construit au setup
   * @see https://github.com/NodeRedis/node_redis#rediscreateclient
   */
  function getRedisClient () {
    if (!redisClient) throw notSetError
    return redisClient
  }

  /**
   * Retourne toutes les clés
   * @param pattern
   * @param {keysRedisCallback} cb
   * @return {undefined|Promise} qui wrap cb si fourni
   */
  function keys (pattern, cb) {
    if (!redisClient) return notSet(cb)
    if (!cb) return promisify(keys, pattern)
    if (typeof pattern !== 'string') return cb(new Error('keys needs a pattern as first parameter'))
    // faut virer les préfixes
    redisClient.keys(redisPrefix + pattern, (error, keys) => {
      if (error) cb(error)
      else cb(null, keys.map(k => k.substr(redisPrefix.length)))
    })
  }

  /**
   * Ferme la connexion à redis
   * @see http://redis.js.org/#api-clientquit
   */
  function quit () {
    if (!redisClient) return
    redisClient.quit()
    redisClient = null
  }

  /**
   * Efface toutes les clés (renvoie le nb de clés effacées)
   * @param [cb]
   * @return {Promise} qui wrap cb si fourni
   */
  function purge (cb) {
    if (!redisClient) return notSet(cb)
    if (cb) return purge().then((data) => cb(null, data), cb)
    // plus simple à écrire avec un tableau de promesses (sinon faudrait un flow.seqEach)
    const getPromises = (keys) => keys.map(k => redisClient.del(k))
    return keys('*')
      .then(keys => Promise.all(getPromises(keys)))
      .then(data => Promise.resolve(data.filter(k => k).length))
  }

  /**
   * Affecte une valeur en cache
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl=600] ttl en s, doit être entre 1 et 24×3600 (1j)
   * @param {redisClientSetCallback} [cb]
   * @return {Promise} qui wrap cb si fourni
   */
  function set (key, value, ttl, cb) {
    if (!redisClient) return notSet(cb)
    // optional ttl
    if (typeof ttl === 'function') {
      cb = ttl
      ttl = TTL_DEFAULT
    }
    if (!cb) return promisify(set, key, value, ttl)

    // check value
    if (value === undefined || value === null || Number.isNaN(value)) {
      // log.warn('$cache.set doesn’t manage undefined or null values, null will be returned with $cache.get like if key doesn’t exists')
      return cb(null, 'OK')
    }
    value = stringify(value)

    // check ttl
    if (!ttl) ttl = TTL_DEFAULT
    if (typeof ttl !== 'number') {
      log.error(new Error(`ttl must be a number, set to ${TTL_DEFAULT}s`))
      ttl = TTL_DEFAULT
    }
    if (ttl > TTL_MAX) {
      log.error(`ttl ${ttl} too high, set to ${TTL_MAX}s`)
      ttl = TTL_MAX
    }
    if (ttl < 1) {
      log.error(`ttl ${ttl} too low, set to 1s`)
      ttl = 1
    }
    redisClient.set(key, value, 'EX', ttl, cb)
  }

  /**
   * Configure le cache en initialisant un engine, car la session en aura besoin
   * @param {redisOptions} (options] Si non fourni on utilise $settings.get('$cache.redis')
   */
  function setup (cb) {
    if (redisClient) throw new Error('$cache.setup already called')
    const options = $settings.get('$cache.redis', {})
    const firstConnectTimeout = getFirstConnectTimeout()
    let isCbCalled = false

    if (typeof options !== 'object') throw new Error('settings.$cache.redis must be an object')
    // @see https://github.com/NodeRedis/node_redis#rediscreateclient
    if (!options.path && !options.url) {
      // on explicite ces valeurs par défaut
      if (!options.host) {
        log.warn('host not defined in settings, set to 127.0.0.1')
        options.host = '127.0.0.1'
      }
      if (!options.port) {
        log.warn('port not defined in settings, set to 6379')
      }
      if (options.db && typeof options.db !== 'number') {
        log.error('invalid settings.$cache.redis.db value (not a number), unset')
        delete options.db
      }
    }
    if (!options.prefix) {
      options.prefix = $settings.get('application.name', 'app_').replace(/[^a-zA-Z0-9_]/g, '')
      log.error(`settings.$cache.redis should have prefix property, set to ${options.prefix}`)
    }
    redisPrefix = options.prefix
    const client = redis.createClient(options)
    if (!client || !client.get) throw new Error('$cache.configure has failed')
    client.on('connect', () => {
      redisClient = client
      // il faut faire ça qu'une fois (on est rappelé à chaque reconnexion du client)
      if (!isCbCalled) {
        client.on('error', log.error)
        isCbCalled = true
        log('connect OK, redis client is ready')
        cb()
      }
    })
    setTimeout(
      () => {
        if (!isCbCalled) cb(new Error(`Impossible de se connecter à redis après ${firstConnectTimeout}ms`))
      },
      firstConnectTimeout
    )
  }

  /**
   * Service de gestion du cache redis
   * @service $cache
   */
  const $cache = {
    del,
    /**
     * À remplacer par del
     * @deprecated
     */
    delete: del,
    purge,
    keys,
    get,
    getRedisClient,
    quit,
    set,
    setup,
    TTL_DEFAULT,
    TTL_MAX
  }
  return $cache
}
/**
 * Options pour le client redis
 * Il faut fournir obligatoirement
 * - path ou url ou host ET port
 * @typedef redisOptions
 * @type Object
 * @see https://github.com/NodeRedis/node_redis#rediscreateclient
 * @property {string} [path] socket unix
 * @property {string} [url] Format [redis:]//[[user][:password@]][host][:port][/db-number][?db=db-number[&password=bar[&option=value]]]
 */
/**
 * @callback redisClientDeleteCallback
 * @param {RedisError} error
 * @param {RedisResult} result
 */
/**
 * @callback redisClientGetCallback
 * @param {RedisError} error
 * @param {*} value Valeur récupérée en cache ou undefined
 */
/**
 * @callback redisClientSetCallback
 * @param {RedisError} error
 * @param {RedisResult} result
 */
/**
 * @callback keysRedisCallback
 * @param {RedisError} error
 * @param {Iterator.<string>} keys
 */
