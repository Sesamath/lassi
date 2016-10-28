'use strict';

var _            = require('lodash');
var log = require('an-log')('lassi-services');

class Services {
  constructor() {
    this._services = {};
  }

  register(name, service) {
    if (this._services[name]) throw new Error('Already registered service '+name);
    if (!lassi.options.cli) {
      log('registered', 'service', name.blue);
    }
    this._services[name] = service;
  }

  parseInjections(fn, context) {
    context = context || {};
    var match = fn.toString().match(/function[\s\w]+\(\s*([^\)]*)\s*\)/);
    var args = match[1].trim();
    if (args==='') { args = []; } else { args = args.split(/\s*,\s*/); }
    var self = this;
    args = _.map(args, function(name) { return self.resolve(name); });

    var service = fn.apply(context, args);
    return service;
  }

  resolve(name) {
    if (!this._services[name]) throw new Error('Unknow service '+name);
    if (typeof this._services[name] === 'function') {
      this._services[name] = this.parseInjections(this._services[name]);
    }
    return this._services[name];
  }

  services() {
    return this._services;
  }
}

module.exports = Services;
