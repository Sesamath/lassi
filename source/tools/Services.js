'use strict'
const log = require('an-log')('lassi-services')

class Services {
  constructor () {
    this._services = {}
  }

  register (name, service) {
    if (this._services[name]) throw new Error('Already registered service ' + name)
    if (!lassi.options.cli) {
      log('registered', 'service', name.blue)
    }
    this._services[name] = service
  }

  parseInjections (fn, context) {
    context = context || {}
    const match = fn.toString().match(/function[\s\w]+\(\s*([^\)]*)\s*\)/)
    const strArgs = match[1].trim()
    const args = strArgs ? strArgs.split(/\s*,\s*/) : []
    const injections = args.map(name => this.resolve(name))
    const service = fn.apply(context, injections)
    return service
  }

  resolve (name) {
    if (!this._services[name]) throw new Error('Unknow service ' + name)
    if (typeof this._services[name] === 'function') {
      this._services[name] = this.parseInjections(this._services[name])
    }
    return this._services[name]
  }

  services () {
    return this._services
  }
}

module.exports = Services
