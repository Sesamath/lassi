'use strict'

const anLog = require('an-log')('lassi-cli')
const {addConditions, grab} = require('./_helpers')

// sera redéfini par chaque commande pour avoir le bon préfixe
let log = (...args) => anLog('entities-cli select', ...args)
const defaultLimit = 100

/**
 * Affiche les entités demandées
 * @param {string} entityName Le nom de l'entité, mettre help pour avoir la syntaxe des arguments
 * @param {string} [fields=''] Liste des champs à afficher (séparateur virgule)
 * @param {string} [wheres=''] Liste de conditions (array en json)
 * @param {string} [options=''] Liste de conditions (array en json)
 * @param {errorCallback} done
 */
function select (entityName, fields, wheres, options, done) {
  /**
   * Affiche une entité
   * @private
   * @param entity
   * @param next
   */
  function printOne (entity, next) {
    if (fields) {
      // en ligne
      log(fieldList.reduce((acc, field) => acc + entity[field] + '\t| ', ''))
    } else {
      // le json
      log('\n' + JSON.stringify(entity, null, 2))
    }
    next()
  }

  log = (...args) => anLog('entities-cli select', ...args)
  if (!arguments.length) throw new Error('Erreur interne, aucun arguments de commande')
  if (arguments.length === 2) {
    done = fields
    fields = ''
    wheres = ''
    options = ''
  } else if (arguments.length === 3) {
    done = wheres
    wheres = ''
    options = ''
  } else if (arguments.length === 4) {
    done = options
    options = ''
  }
  if (typeof done !== 'function') throw new Error('Erreur interne, pas de callback de commande')
  if (typeof entityName !== 'string') return done(new Error('Il faut passer un nom d’entity (ou "help") en 1er argument'))

  const opts = {}
  options.split(',').forEach(elt => {
    const opt = elt.trim()
    if (opt) opts[opt] = true
  })

  const fieldList = fields ? fields.split(',').map(field => field.trim()) : []

  let query
  let Entity
  try {
    try {
      Entity = lassi.service(entityName)
    } catch (error) {
      return done(new Error(`Aucune entity nommée ${entityName} (utiliser la commande "allServices" pour voir services et entités)`))
    }
    query = addConditions(Entity, wheres)

    // Ligne de titres sommaire
    let titles = ''
    if (fields) {
      titles = fieldList.reduce((acc, field) => acc + field + '\t| ', '')
      log(titles)
    }

    const groupCb = (start, nb) => {
      if (opts.quiet) return
      log(`\n\n(fin select de ${start} à ${start + nb})`)
      if (nb === defaultLimit) log(titles)
    }

    grab(
      query,
      defaultLimit,
      printOne,
      { groupCb },
      done
    )
  } catch (error) {
    done(error)
  }
}
select.help = function selectHelp () {
  log = (...args) => anLog('entities-cli select', 'usage', ...args)
  log(`
La commande select demande 1 à 3 arguments :
#1 : le nom de l’entité cherchée
#2 : (facultatif) la liste des champs à afficher, mettre une chaine vide pour les afficher tous
#3 : (facultatif) une chaine json présentant un tableau de conditions
       dont chaque élément est un tableau [champ, condition, valeur]
       condition doit être parmi : = > < >= <= <> in notIn isNull isNotNull
       Pour les conditions in|notIn, valeur doit être une liste (séparateur virgule)
#4 : (facultatif) une chaine présentant la liste des options (séparateur virgule)
       options: quiet => ne pas répéter la ligne de titre`)
}

module.exports = select
