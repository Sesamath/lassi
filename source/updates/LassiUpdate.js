'use strict'

module.exports = function () {
  /**
   * Notre entité update, cf [Entity](lassi/Entity.html)
   * @entity LassiUpdate
   * @param {Object} initObj Un objet ayant des propriétés d'un update
   * @extends Entity
   */
  this.construct(function (initObj) {
    if (!initObj.name) throw new Error('Une entité LassiUpdate doit avoir un attribut name')
    if (typeof initObj.num !== 'number') throw new Error('Une entité LassiUpdate doit avoir un attribut num')

    this.oid = initObj.oid
    this.name = initObj.name
    this.num = initObj.num
    this.date = new Date()
  })

  this
    .defineIndex('num', 'integer')
    .defineIndex('date', 'date')
}
