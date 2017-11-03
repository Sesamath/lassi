'use strict'

/**
 * Accès au cache via cli
 * @service $cache-cli
 */
module.exports = function () {
  const $cache = lassi.service('$cache')
  return {
    cacheDelete: $cache.delete,
    cacheGet: $cache.get,
    cacheKeys: $cache.keys,
    cachePurge: $cache.purge,
    cacheSet: $cache.set
  }
}
