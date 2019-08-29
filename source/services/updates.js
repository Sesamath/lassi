'use strict'

const flow = require('an-flow')
const path = require('path')
const fs = require('fs')
const log = require('an-log')('$updates')

module.exports = function (LassiUpdate, $maintenance, $settings) {
  /**
   * @callback errorCallback
   * @param {Error} [error]
   */
  /**
   * - Init updatesToRun avec le tableau des updates en attente
   * - Si il y a des updates à traiter: lock les updates
   * - Si certaines sont bloquantes: passe en mode maintenance
   * - appelle le cb
   * @param {errorCallback} cb
   */
  function checkAndLock (cb) {
    flow().seq(function () {
      getPendingUpdates(this)
    }).seq(function (pendingUpdates) {
      updatesToRun = pendingUpdates
      let msg = `Base en version ${dbVersion} : `
      if (!updatesToRun) {
        log(msg + 'updates non gérés')
        return cb()
      } else if (updatesToRun.length === 0) {
        log(msg + 'pas de mises à jour')
        return cb()
      }

      msg += `${updatesToRun.length} mises à jour à traiter`
      lockUpdates()

      // Si aucune MAJ bloquantes, pas besoin d'activer la maintenance,
      if (updatesToRun.every((u) => u.isNotBlocking)) {
        log(msg)
        return cb()
      }

      log(msg + ' dont certaines bloquantes')
      lockMaintenance(cb)
    }).catch(cb)
  }

  /**
   * @callback getPendingUpdatesCallback
   * @param {Error} [error]
   * @param {PendingUpdate[]|undefined} updates les updates en attente
   *                                    (undefined si y'a un pb pour les trouver ou les appliquer,
   *                                    pb signalés en console.error ou dans le log d'erreur)
   */
  /**
   * Vérifie s'il y a des updates à lancer
   * @private
   * @param {getPendingUpdatesCallback} cb
   */
  function getPendingUpdates (cb) {
    function warn (errorMessage) {
      log.error(errorMessage)
      cb()
    }
    // récup de la config, si on trouve pas on laisse tomber en le signalant mais sans planter
    const updates = $settings.get('application.updates')
    if (!updates) return warn('config.application.updates manquant, updates ignorés par lassi')
    if (!updates.folder) return warn('config.application.updates.folder manquant')
    const lock = updates.lockFile
    if (!lock) return warn('config.application.updates.lockFile manquant')
    lockFile = lock
    // si y'a un lock on arrête là
    if (isUpdateLocked()) return warn(`${lockFile} présent, on ignore les updates automatiques`)

    // on a toutes les infos et pas de lock
    flow().seq(function () {
      // version actuelle
      LassiUpdate.match('num').sort('num', 'desc').grabOne(this)
    }).seq(function (lastLassiUpdate) {
      const firstUpdateNum = getMinNumAvailableUpdate()
      const defaultVersion = firstUpdateNum ? firstUpdateNum - 1 : 0
      if (lastLassiUpdate) {
        // on vérifie qu'on a pas de trou
        if (lastLassiUpdate.num < defaultVersion) return this(new Error(`La base est en version ${lastLassiUpdate.num} mais le premier update disponible est le n° ${firstUpdateNum}`))
        this(null, lastLassiUpdate)
      } else {
        // pas d'update en db, init avec le n° juste avant le premier update dispo
        const firstLassiUpdate = {
          name: 'version initiale',
          description: '',
          num: defaultVersion
        }
        LassiUpdate.create(firstLassiUpdate).store(this)
      }
    }).seq(function (lassiUpdate) {
      dbVersion = lassiUpdate.num
      getUpdatesAboveVersion(dbVersion, this)
    }).done(cb)
  }

  /**
   * Retourne le nom du fichier d'update (sans vérifier qu'il existe)
   * @private
   * @param {string|number} num
   * @return {string}
   */
  function getUpdateFilename (num) {
    const folder = $settings.get('application.updates.folder')
    if (!folder) throw new Error('settings.application.updates.folder is undefined')
    return path.join(folder, num + '.js')
  }
  /**
   * Vérifie le lock
   * @private
   * @return {boolean} true si y'a un lock
   */
  function isUpdateLocked () {
    try {
      fs.accessSync(lockFile, fs.R_OK)
      return true
    } catch (error) {
      // lock n’existe pas,
      return false
    }
  }

  /**
   * Passe en mode maintenance et init maintenanceReason
   * @private
   * @param cb
   */
  function lockMaintenance (cb) {
    flow().seq(function () {
      $maintenance.getMaintenanceMode(this)
    }).seq(function ({mode, reason}) {
      // On active la maintenance si elle n'est pas déjà active
      if (mode === 'off') {
        log('Activation du mode maintenance')
        maintenanceReason = 'update'
        $maintenance.setMaintenance('on', maintenanceReason, this)
      } else {
        log(`Mode maintenance déjà activé (${reason})`)
        maintenanceReason = reason
        this()
      }
    }).done(cb)
  }

  /**
   * Pose le lock Updates
   * @private
   */
  function lockUpdates () {
    lockFileSet = true
    fs.writeFileSync(lockFile, null)
  }
  /**
   * Enlève le lock
   * @private
   */
  function unlockUpdates () {
    lockFileSet = false
    try {
      fs.unlinkSync(lockFile)
    } catch (e) {
      log.error(e)
    }
  }

  /**
   * @callback updateExistCallback
   * @param error
   * @param {boolean} exist false si l'update numéro updateNum n'existe pas
   */
  /**
   * Vérifie s'il existe un update n° updateNum
   * @private
   * @param {number|string} updateNum
   * @param {updateExistCallback} cb
   */
  function updateExist (updateNum, cb) {
    const fileToRequire = getUpdateFilename(updateNum)
    fs.access(fileToRequire, fs.R_OK, function (err) {
      cb(null, !err)
    })
  }

  /**
   * Récupère la version minimum disponible dans le dossier d'updates en se basant sur le nom de fichier (undefined s'il n'y en a pas)
   * @private
   * @return {Number|undefined}
   */
  function getMinNumAvailableUpdate () {
    const folder = $settings.get('application.updates.folder')
    // on liste les fichiers sous la forme N.js où N est entier (on suppose que personne n'ira nommer un dossier NNN.js)
    const updatesNumbers = fs.readdirSync(folder)
      .filter(filename => /^[1-9][0-9]*\.js$/.test(filename))
      .map(filename => Number(filename.substring(filename, filename.length - 3)))
    // si le tableau est vide, Math.min se retrouve sans arqument et renvoie Infinity (qui est > 0)
    // sinon, la regexp nous garanti qu'il ne contient que des entiers strictement positifs
    return updatesNumbers.length ? Math.min(...updatesNumbers) : undefined
  }

  /**
   * @callback getUpdatesAboveVersionCallback
   * @param error
   * @param {PendingUpdate[]} updates tableau des updates qui démarre avec l'update version+1 (et tous les suivants)
   */
  /**
   * Récupère les updates supérieures à version
   * @private
   * @param {number|string} version
   * @param {getUpdatesAboveVersionCallback} cb
   */
  function getUpdatesAboveVersion (version, cb) {
    /** @type {PendingUpdate[]} */
    const pendingUpdates = []
    const checkUpdate = (num) => {
      updateExist(num, (err, exist) => {
        if (err) return cb(err)
        if (exist) {
          const update = require(getUpdateFilename(num))
          update.$num = num
          pendingUpdates.push(update)
          checkUpdate(num + 1)
        } else {
          // On a atteint la dernière
          cb(null, pendingUpdates)
        }
      })
    }
    checkUpdate(version + 1)
  }

  /**
   * Applique un update
   * @private
   * @param {PendingUpdate} update
   * @param cb
   */
  function runUpdate (update, cb) {
    const num = update.$num
    if (!Number.isInteger(num)) return cb(Error('Impossible de lancer un update sans n° entier'))
    if (typeof update.run !== 'function') return cb(Error('Impossible de lancer un update sans méthode run'))
    if (!Number.isInteger(dbVersion)) return cb(Error('Impossible de lancer un update sans connaître la version actuelle de la base'))
    if (num !== dbVersion + 1) return cb(Error(`La base est en version ${dbVersion}, impossible d’appliquer l'update ${num}`))
    flow().seq(function () {
      let msg = `lancement update n° ${num} : ${update.name}`
      if (update.description) msg += `\n${update.description}`
      log(msg)
      update.run(this)
    }).seq(function () {
      log(`fin update n° ${num}`)
      LassiUpdate.create({
        name: update.name,
        description: update.description,
        num
      }).store(this)
    }).seq(function () {
      log(`update n° ${num} OK, base en version ${num}`)
      dbVersion = num
      cb()
    }).catch(cb)
  }

  /**
   * Applique tous les updates qui restent
   * @private
   * @param {PendingUpdate[]} updates
   * @param cb rappelée avec (error, lastVersionNum)
   */
  function runUpdates (updates, cb) {
    if (!Array.isArray(updates) || !updates.length) return cb(Error('runUpdates appelé sans updates'))
    const [update, ...nextUpdates] = updates
    // On lance la première...
    runUpdate(update, (err) => {
      if (err) return cb(err)
      if (nextUpdates.length) {
        // ... puis les suivantes (récursivement)
        process.nextTick(() => runUpdates(nextUpdates, cb))
      } else {
        // on a atteint la dernière
        cb(null, update.$num)
      }
    })
  }

  // méthodes exportées

  /**
   * @callback updateCallback
   * @param {Error|null|undefined} error
   * @param {number} updateNum 0 si y'avait pas d'update à lancer
   */
  /**
   * Lance les updates qui n'ont pas encore été appliquées
   * @param {updateCallback} [cb]
   */
  function runPendingUpdates (cb) {
    // runPendingUpdates peut être appelé sans callback quand on n'a pas besoin d'attendre la fin des updates
    if (!cb) cb = () => undefined
    if (updatesToRun && !updatesToRun.length) return cb()

    flow().seq(function () {
    // on est pas sûr que postSetup ait déjà été appelé
      if (updatesToRun === undefined) checkAndLock(this)
      else this()
    }).seq(function () {
      runUpdates(updatesToRun, this)
    }).seq(function (updatedDbVersion) {
      log('plus d’update à faire, base en version', updatedDbVersion)
      // On enlève la maintenance, sauf si elle était déjà en place pour une autre raison (settings ou manuel)
      if (maintenanceReason === 'update') {
        return $maintenance.setMaintenance('off', maintenanceReason, this)
      }
      this()
    }).done(function (err) {
      if (err) {
        log.error(`Une erreur est survenue dans l’update ${dbVersion + 1}`)
        log.error(err)
        if (maintenanceReason === 'update') {
          log.error('Le mode maintenance sera automatiquement désactivé une fois l\'update correctement terminée')
        }
      }
      unlockUpdates()
      cb(err)
    })
  }

  /**
   * Applique les éventuelles mises à jour (au démarrage, appelé après setup et avant boot complet)
   * @param {simpleCallback} cb rappelé avant de lancer les updates (mais après pose du lock si y'a besoin)
   */
  function postSetup (cb) {
    // On applique automatiquement les mises à jour au démarrage
    // (hors cli, mais runPendingUpdates peut être appelé en cli quand même)
    // (et hors test)
    if (lassi.options.cli || process.env.NODE_ENV === 'test') {
      return cb()
    }
    // si on est en mode cluster avec pm2, on ne se lance que sur la 1re instance (0)
    // C'est une sécurité en plus du lockFile
    if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE > 0) {
      log('instance n° ' + process.env.NODE_APP_INSTANCE + ', abandon pour laisser l’instance 0 faire le job')
      return cb()
    }
    lassi.on('shutdown', () => lockFileSet && unlockUpdates())
    // on est en postSetup, donc tous les services dont on peut avoir besoin (LassiUpdate) sont dispos,
    // mais l'appli n'a pas terminé le boot, on vérifie s'il faut poser un lock maintenance
    // avant d'appeler la callback ($server.start aura lieu juste après la fin de tous les postSetup)
    checkAndLock(function (error) {
      if (error) return cb(error)
      cb()
      if (updatesToRun && updatesToRun.length) runPendingUpdates()
    })
    $maintenance.getMaintenanceMode((error, {mode, reason}) => {
      if (error) log.error(error)
      log(`Actuellement la maintenance est ${mode} (reason: ${reason})`)
    })
  }

  // runPendingUpdates pourrait être appelé avant postSetup (dans un autre postSetup qui passerait avant nous),
  // on utilise ces variables comme flag

  // affecté au postSetup par checkIfUpdates
  let dbVersion, updatesToRun, lockFile
  // affecté par lockMaintenance
  let maintenanceReason
  let lockFileSet = false

  return {
    postSetup,
    runPendingUpdates
  }
}

/**
 * @callback runCallback
 * @param {errorCallback} callback rappelée avec l'erreur éventuelle
 */
/**
 * @typedef PendingUpdate
 * @property {number} $num Le n° de l'update (le nom du js, qui sera le num du LassiUpdate que l'on créera après exécution
 * @property {boolean} [isNotBlocking] mettre à true si on peut lancer l'appli sans attendre la fin de l'update
 * @property {string} name
 * @property {string} [description]
 * @property {runCallback} run La fonction à appeler pour lancer l'update
 */
