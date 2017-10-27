'use strict'
// Pour la version avec cacheManager, voir la version 2.1.23 (ou antérieure)
// RedisEngine a été ajouté par le commit 67be1f2 puis fusionné ici
const log = require('an-log')('$cache')
const redis = require('redis')

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

module.exports = function ($settings) {
  // une seule instance d'un seul client
  const notSet = () => { throw new Error('$cache.configure has failed (or wasn’t called)') }
  let client = {
    delete: notSet,
    get: notSet,
    set: notSet
  }

  /**
   * Configure le cache en initialisant un engine, car la session en aura besoin
   * @param {redisOptions} (options] Si non fourni on utilise $settings.get('$cache.redis')
   */
  function setup (cb) {
    const options = $settings.get('$cache.redis', {})
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
    const redisClient = redis.createClient(options)
    if (!redisClient || !redisClient.get) throw new Error('$cache.configure has failed')
    redisClient.on('error', log.error)
    client = redisClient
    // on wrap set pour obliger à mettre un ttl
    client.set = (key, value, ttl, ttlMs) => {
      if (!ttl && !ttlMs) ttl = TTL_DEFAULT
      if (ttl > TTL_MAX) {
        log.error(`ttl ${ttl} too high, set to ${TTL_MAX}`)
        ttl = TTL_MAX
      }
      redisClient.set(key, value, ttl, ttlMs)
    }
    log('redis client is ready')
    cb()
  }

  /**
   * Service de gestion du cache redis
   * @service $cache
   */
  return {
    delete: client.delete,
    get: client.get,
    getRedisClient: () => client,
    set: client.set,
    setup
  }
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
