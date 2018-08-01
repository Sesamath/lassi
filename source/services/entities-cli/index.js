'use strict'

const count = require('./count')
const purgeDeleted = require('./purgeDeleted')
const reindexAll = require('./reindexAll')
const select = require('./select')
const validAll = require('./validAll')

/**
 * Service de gestion des entités via cli
 * @service $entities-cli
 */
module.exports = function () {
  return {
    commands: () => ({
      count,
      purgeDeleted,
      reindexAll,
      select,
      validAll
    })
  }
}
