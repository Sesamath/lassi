"use strict";

const minimist = require('minimist')

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
    console.log(`Syntaxe :\n  ${cliRunner} [options] command […args]`)
    console.log('Options :')
    console.log('  --debug : affiche la stack complète en cas d’erreur (implique verbose)')
    console.log('  -h --help : affiche cette aide')
    console.log('  -l --list : affiche la liste des commandes possibles')
    console.log('  -v --verbose : affiche qq détails sur le déroulement')
    if (errorCode) process.exit(errorCode);
  }

  /**
   * Affiche une info en console si --verbose
   * @methodOf $cli
   * @param {...*} args Les arguments à passer à console.log (à volonté)
   */
  function printInfo (args) {
    if (verbose) console.log.apply(console, arguments)
  }

  /**
   * Affiche une erreur (avec stackTrace si --debug)
   * @methodOf $cli
   * @param {string|Error} error
   */
  function printError (error) {
    console.error('Une erreur est survenue à l’exécution de ' + commandName)
    if (debug) console.error(error)
    else if (error.message) console.error(error.message)
    else console.error(error)
  }

  function printAllCommands () {
    console.log('liste des commandes disponibles :\n*', Object.keys(commands).join('\n* '))
  }

  const cliRunner = process.argv[1]
  const args = minimist(process.argv.slice(2), {boolean: ['debug', 'h', 'help', 'l', 'list', 'v', 'verbose']})
  const commandName = args._[0]
  const commandArgs = commandName && args._.slice(1) || []
  const helpAsked = args.h || args.help
  const listAsked = args.l || args.list
  const debug = args.debug
  const verbose = debug || args.v || args.verbose
  const commands = {}

  /**
   * Lance la commande et sort
   * @memberOf $cli
   */
  function run () {
    function exit (error, result) {
      if (error) printError(error)
      if (result) console.log(`Retour de la commande ${commandName}\n`, result)
      else printInfo('Fin ' + commandName)
      process.exit(error ? 2 : 0)
    }
    try {
      // on récupère tous les services
      const services = lassi.allServices()
      // filtre sur *-cli
      const cliServices = Object
        .keys(services)
        .filter(k => k.substr(-4) === '-cli')
        .map(k => lassi.service(k))
      // appelle pour chaque service *-cli sa méthode commands
      cliServices.forEach(function(service) {
        const tmp = service.commands()
        for (let name in tmp) {
          commands[name] = tmp[name]
          if (typeof tmp[name].help !== 'function') {
            tmp[name].help = () => console.log(`La commande ${name} ne fournit pas d’aide sur son usage`)
          }
        }
      })
      // on ajoute qq commandes universelles
      commands.listAllServices = (cb) => {
        console.log('Tous les services :\n  ' + Object.keys(services).join('\n  ') + '\n')
        cb()
      }
      commands.listAllServices.help = (cb) => {
        console.log('Liste tous les services déclarés dans cette appli')
        cb
      }

      if (listAsked) {
        printAllCommands()
        process.exit(0)
      }
      if (helpAsked) {
        if (commands[commandName]) {
          if (commands[commandName].help) commands[commandName].help()
          else console.log(`La commande ${commandName} existe mais ne propose pas d'aide (méthode help)`)
        } else {
          usage()
        }
        process.exit(0)
      }
      if (!commandName) {
        console.error('Il faut passer une commande à exécuter')
        usage(1)
      }
      // on ajoute debug sur lassi
      lassi.debug = debug

      const command = commands[commandName]
      if (!command) {
        console.error(`Commande "${commandName}" inconnue`)
        usage(1)
      }

      // info avant de lancer
      const msgStart = 'Lancement de la commande ' + commandName
      if (commandArgs.length) printInfo(msgStart, 'avec les arguments', commandArgs)
      else printInfo(msgStart, 'sans arguments')

      // on ajoute la callback en dernier argument
      commandArgs.push(exit)

      // et on lance la commande
      command.apply(this, commandArgs)
    } catch (error) {
      printError(error)
      process.exit(3);
    }
  }

  return {
    printError,
    printInfo,
    run,
    usage
  }
}

