'use strict'

const minimist = require('minimist')
const anLog = require('an-log')('lassi-cli')
const anLogLevels = require('an-log/source/lib/levels.js')

const log = {
  // arguments n'existe pas sur les fonctions fléchées
  debug: (...args) => anLog.debug('cli', ...args),
  error: (...args) => anLog.error('cli', ...args),
  info: (...args) => anLog.info('cli', ...args),
  warn: (...args) => anLog.warn('cli', ...args)
}
// on utilisera directement console.log ou console.error pour la sortie de commande
// que l'on veut toujours afficher (même en --quiet)

/**
 * Service de gestion des commandes CLI
 * Une seule fonction sans argument qui exécutera la commande en argument du script courant
 * @service $cli
 */
module.exports = function () {
  /**
   * Affiche la syntaxe cli et sort si errorCode est fourni
   * @methodOf $cli
   * @param {Integer} [errorCode]
   */
  function usage (errorCode) {
    console.log(`
Syntaxe :\n  ${cliRunner} [options] command […args]
Options :
  --debug : affiche la stack complète en cas d’erreur (implique verbose)
  -h --help : affiche cette aide
  -l --list : affiche la liste des commandes possibles
  -q --quiet : n'affiche que les warnings et les erreurs
  -v --verbose : affiche tous les messages`)
    if (errorCode) process.exit(errorCode)
  }

  /**
   * Affiche une erreur (avec stackTrace si --debug)
   * @methodOf $cli
   * @param {string|Error} error
   */
  function printError (error) {
    log.error('Une erreur est survenue à l’exécution de ' + commandName)
    // en mode debug on affiche toute la stack
    if (debug) log.error(error)
    // sinon le message seulement
    else log.error(error.message ? error.message : error)
  }

  /**
   * Affiche la liste des commandes cli de l'appli (avec celles fournies par lassi)
   */
  function printAllCommands () {
    console.log('Liste des commandes disponibles :\n*', Object.keys(commands).join('\n* '))
  }

  /**
   * Lance la commande et sort
   * @memberOf $cli
   */
  function run () {
    function exit (error, result) {
      if (error) printError(error)
      if (result) log.info(`Retour de la commande ${commandName}\n`, result)
      else log.info('Fin ' + commandName)
      lassi.shutdown(error ? 2 : 0)
    }

    try {
      if (!listAsked && (helpAsked || !commandName)) {
        const errorCode = helpAsked ? 0 : 1
        if (errorCode) log.error('Il faut passer une commande à exécuter')
        usage(errorCode)
      }

      // On récupère tous les services
      const services = lassi.allServices()

      // Filtre sur *-cli
      const cliServices = Object.keys(services)
        .filter(k => k.substr(-4) === '-cli')
        .map(k => lassi.service(k))

      // Appelle pour chaque service *-cli sa méthode commands ou lui-même
      cliServices.forEach((service) => {
        const serviceCommands = service.commands ? service.commands() : service
        for (let name in serviceCommands) {
          commands[name] = serviceCommands[name]
          if (typeof serviceCommands[name].help !== 'function') {
            serviceCommands[name].help = () => log.error(`La commande ${name} ne fournit pas d’aide sur son usage`)
          }
        }
      })

      // On ajoute quelques commandes universelles
      commands.listAllServices = (cb) => {
        console.log('Tous les services :\n  ' + Object.keys(services).join('\n  ') + '\n')
        cb()
      }
      commands.listAllServices.help = (cb) => {
        console.log('Liste tous les services déclarés dans cette appli')
        cb()
      }

      if (listAsked) {
        printAllCommands()
        process.exit(0)
      }

      if (helpAsked) {
        if (commands[commandName]) {
          if (commands[commandName].help) commands[commandName].help()
          else console.warn(`La commande ${commandName} existe mais ne propose pas d'aide (méthode help)`)
        } else {
          usage()
        }
        process.exit(0)
      }

      if (!commandName) {
        log.error('Il faut passer une commande à exécuter')
        usage(1)
      }
      // On ajoute debug sur lassi
      lassi.debug = debug

      const command = commands[commandName]
      if (!command) {
        log.error(`Commande "${commandName}" inconnue`)
        usage(1)
      }

      // Info avant de lancer
      const msgStart = 'Lancement de la commande ' + commandName
      if (commandArgs.length) log.info(msgStart, 'avec les arguments', commandArgs)
      else log.info(msgStart, 'sans arguments')

      // On ajoute la callback en dernier argument
      commandArgs.push(exit)

      // On lance la commande
      command.apply(this, commandArgs)
    } catch (error) {
      printError(error)
      process.exit(3)
    }
  }

  const cliRunner = process.argv[1]
  const args = minimist(process.argv.slice(2), {boolean: ['debug', 'h', 'help', 'l', 'list', 'q', 'quiet', 'v', 'verbose']})
  const commandName = args._[0]
  const commandArgs = (commandName && args._.slice(1)) || []
  const helpAsked = args.h || args.help
  const listAsked = args.l || args.list
  const debug = args.debug
  const quiet = args.q || args.quiet
  const verbose = debug || args.v || args.verbose
  const commands = {}
  if (verbose) anLog.setLogLevel(anLogLevels.DEBUG)
  else if (quiet) anLog.setLogLevel(anLogLevels.WARNING)
  else anLog.setLogLevel(anLogLevels.INFO)

  return {
    printDebug: log.debug,
    printError,
    printInfo: log.info,
    printWarning: log.warn,
    run,
    usage
  }
}
