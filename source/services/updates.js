'use strict'

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
   * Init hasUpdatesToRun et passe en mode maintenance si besoin avant de rappeler cb
   * @param {errorCallback} cb
   */
  function checkAndLock (cb) {
    flow().seq(function () {
      checkIfUpdates(this)
    }).seq(function (hasUpdates) {
      hasUpdatesToRun = hasUpdates
      if (!hasUpdates) return cb()
      // y'a tu taf, faut passer en maintenance avant d'appeler cb
      lockMaintenance(this)
    }).done(cb)
  }

  /**
   * @callback hasUpdatesCallback
   * @param {Error} error
   * @param {boolean} hasUpdates
   */
  /**
   * Vérifie s'il y a des updates à lancer
   * @private
   * @param {hasUpdatesCallback} cb
   */
  function checkIfUpdates (cb) {
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
      log(`version ${dbVersion}`)
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
      updateExist(dbVersion + 1, this)
    }).seq(function(exist) {
      if (!exist) log(`${lockFile} non présent, base à jour en version ${dbVersion}`)
      cb(null, exist)
    }).catch(cb)
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
    log(`${lockFile} non présent, base en version ${dbVersion} avec updates à appliquer`)
    flow().seq(function () {
      lockUpdates()
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
    fs.unlinkSync(lockFile)
  }


  /**
   * @callback updateExistCallback
   * @param error
   * @param {number} updateNum (0 si pas d'update)
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
    function runUpdate (num, cb) {
      const updateFile = getUpdateFilename(num)
      const update = require(updateFile)
      if (!update || !update.run) throw new Error(`${updateFile} n’est pas un fichier d’update valide`)
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
    function runNextUpdates(version, cb) {
      const nextUpdateNum = version + 1
      flow()
      .seq(function() {
        updateExist(nextUpdateNum, this)
      })
      .seq(function(exist) {
        if (exist) runUpdate(nextUpdateNum, this)
        // Find de la boucle récursive, on renvoie le dernier dbVersion à jour
        else cb(null, version)
      })
      .seq(function() {
        runNextUpdates(nextUpdateNum, this)
      })
      .done(cb)
    }

    // MAIN
    // runPendingUpdates peut être appelé sans callback quand on n'a pas besoin d'attendre la fin des updates
    if (!cb) cb = () => undefined
    if (hasUpdatesToRun === false) return cb()

    flow()
    .seq(function() {
      // on est pas sûr que postSetup ait déjà été appelé
      if (hasUpdatesToRun === undefined) checkAndLock(this)
      else this()
    })
    .seq(function() {
      runNextUpdates(dbVersion, this)
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
      if (hasUpdatesToRun) runPendingUpdates()
    })
    $maintenance.getMaintenanceMode((error, {mode, reason}) => log(`Actuellement la maintenance est ${mode} avec ${reason}`))
  }

  // runPendingUpdates pourrait être appelé avant postSetup (dans un autre postSetup qui passerait avant nous),
  // on utilise ces variables comme flag

  // affecté au postSetup par checkIfUpdates
  let dbVersion, hasUpdatesToRun, lockFile
  // affecté par lockMaintenance
  let maintenanceReason
  let lockFileSet = false

  return {
    postSetup,
    runPendingUpdates
  }
}
