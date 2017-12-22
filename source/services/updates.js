'use strict'

const _ = require('lodash')
const flow = require('an-flow')
const path = require('path')
const fs = require('fs')
const log = require('an-log')('$updates')

module.exports = function(LassiUpdate, $maintenance, $settings) {
  /**
   * @callback errorCallback
   * @param {Error|string} [error]
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

      if (updatesToRun.length === 0) {
        log(msg + 'pas de mises à jour')
        return cb()
      }

      msg += `${updatesToRun.length} mises à jour à traiter`
      lockUpdates()

      // Si aucune MAJ bloquantes, pas besoin d'activer la maintenance
      if (_.every(updatesToRun, (u) => u.isNotBlocking)) {
        log(msg)
        return cb();
      }

      log(msg + ' dont certaines bloquantes')
      lockMaintenance(cb)
    }).catch(cb)
  }

  /**
   * @callback getPendingUpdatesCallback
   * @param {Error} error
   * @param {array} updates tableau d'updates en attente
   */
  /**
   * Vérifie s'il y a des updates à lancer
   * @private
   * @param {getPendingUpdatesCallback} cb
   */
  function getPendingUpdates (cb) {
    function done (errorMessage) {
      log.error(errorMessage)
      cb(null, false)
    }
    // récup de la config, si on trouve pas on laisse tomber en le signalant mais sans planter
    const updates = $settings.get('application.updates')
    if (!updates) return done('config.application.updates manquant, updates ignorés par lassi')
    if (!updates.folder) return done('config.application.updates.folder manquant')
    const lock = updates.lockFile
    if (!lock) return done('config.application.updates.lockFile manquant')
    lockFile = lock
    // si y'a un lock on arrête là
    if (isUpdateLocked()) return done(`${lockFile} présent, on ignore les updates automatiques`)
    // on regarde si y'a un n° de départ en conf (appli avec anciens updates virés du code)
    const defaultVersion = $settings.get('application.updates.defaultVersion', 0)
    flow().seq(function() {
      // version actuelle
      LassiUpdate.match('num').sort('num', 'desc').grabOne(this)
    }).seq(function(lastUpdate) {
      dbVersion = (lastUpdate && lastUpdate.num) || 0
      if (dbVersion < defaultVersion) {
        // init avec la version de départ mise en config
        const firstUpdate = {
          name: 'version initiale',
          description: '',
          num: defaultVersion
        }
        LassiUpdate.create(firstUpdate).store((error) => {
          if (error) return cb(error)
          dbVersion = defaultVersion
          this()
        })
      } else {
        this()
      }
    }).seq(function() {
      getUpdatesAboveVersion(dbVersion, this)
    }).done(cb)
  }

  /**
   * Retourne le nom du fichier d'update (sans vérifier qu'il existe)
   * @private
   * @param {string|number} num
   * @return {string}
   */
  function getUpdateFilename(num) {
    const folder = $settings.get('application.updates.folder')
    if (!folder) throw new Error('settings.application.updates.folder is undefined')
    return path.join(folder, num + '.js')
  }
  /**
   * Vérifie le lock
   * @private
   * @return {boolean} true si y'a un lock
   */
  function isUpdateLocked() {
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
   * @param cb
   */
  function lockMaintenance (cb) {
    flow().seq(function () {
      $maintenance.getMaintenanceMode(this)
    }).seq(function({mode, reason}) {
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
  function lockUpdates() {
    lockFileSet = true
    fs.writeFileSync(lockFile, null)
  }
  /**
   * Enlève le lock
   * @private
   */
  function unlockUpdates() {
    lockFileSet = false
    try {
      fs.unlinkSync(lockFile)
    } catch(e) {
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
   * @callback getUpdatesAboveVersionCallback
   * @param error
   * @param {array} updates tableau des updates dont le numéro est supérieur à dbVersion passé en paramètre
   */
  /**
   * Récupère les updates supérieures à dbVersion
   * @private
   * @param {number|string} dbVersion
   * @param {getUpdatesAboveVersionCallback} cb
   */
  function getUpdatesAboveVersion(dbVersion, cb) {
    const pendingUpdates = []
    const checkUpdate = (num) => {
      updateExist(num, (err, exist) => {
        if (err) return cb(err);
        if (exist) {
          const update = require(getUpdateFilename(num));
          update.$num = num;
          pendingUpdates.push(update)
          checkUpdate(num + 1)
        } else {
          // On a atteint la dernière
          cb(null, pendingUpdates)
        }
      })
    }
    checkUpdate(dbVersion + 1);
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
    /**
     * Applique un update
     * @private
     * @param {number} num
     * @param cb
     */
    function runUpdate (update, cb) {
      const num = update.$num
      flow()
      .seq(function() {
        log(`lancement update n° ${num} : ${update.name}`)
        update.run(this)
      })
      .seq(function() {
        log(`fin update n° ${num}`)
        LassiUpdate.create({
          name: update.name,
          description: update.description,
          num
        }).store(this)
      })
      .seq(function() {
        log(`update n° ${num} OK, base en version ${num}`)
        dbVersion = num
        cb()
      })
      .catch(cb)
    }

    /**
     * Applique tous les updates qui restent
     * @private
     * @param version
     * @param cb rappelée avec (error, version)
     */
    function runUpdates(updates, cb) {
      const [update, ...nextUpdates] = updates
      // On lance la première...
      runUpdate(update, (err) => {
        if (err) return cb(err);
        if (nextUpdates.length) {
          // ... puis les suivantes (récursivement)
          process.nextTick(() => runUpdates(nextUpdates, cb))
        } else {
          // on a atteint la dernière
          cb(null, update.$num)
        }
      })
    }

    // MAIN
    // runPendingUpdates peut être appelé sans callback quand on n'a pas besoin d'attendre la fin des updates
    if (!cb) cb = () => undefined
    if (updatesToRun && !updatesToRun.length) return cb()

    flow()
    .seq(function() {
      // on est pas sûr que postSetup ait déjà été appelé
      if (updatesToRun === undefined) checkAndLock(this)
      else this()
    })
    .seq(function() {
      runUpdates(updatesToRun, this)
    })
    .seq(function(updatedDbVersion) {
      log('plus d’update à faire, base en version', updatedDbVersion)
      // On enlève la maintenance, sauf si elle était déjà en place pour une autre raison (setings ou manuel)
      if (maintenanceReason === 'update') {
        return $maintenance.setMaintenance('off', maintenanceReason, this)
      }
      this()
    })
    .done(function(err) {
      if (err) {
        log.error(`Une erreur est survenue dans l’update ${dbVersion + 1}`)
        log.error(err)
        if (maintenanceReason === 'update') {
          log.error(`Le mode maintenance sera automatiquement désactivé une fois l'update correctement terminée`)
        }
      }
      unlockUpdates()
      cb(err)
    })
  }

  /**
   * Applique les éventuelles mises à jour (au démarrage, appelé après setup et avant boot complet)
   * @param {simpleCallback} cb rappelé avant la fin des updates
   */
  function postSetup (cb) {
    // On applique automatiquement les mises à jour au démarrage
    // (hors cli, mais runPendingUpdates peut être appelé en cli quand même)
    if (lassi.options.cli) {
      return cb();
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
      if (updatesToRun.length) runPendingUpdates()
    })
    $maintenance.getMaintenanceMode((error, {mode, reason}) => log(`Actuellement la maintenance est ${mode} (reason: ${reason})`))
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
