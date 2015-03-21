var _            = require('lodash');

function Services() {
  this._services = {};
}

Services.prototype.register = function(name, service) {
  if (this._services[name]) throw new Error('Already registered service '+name);
  lassi.log("lassi", "service", name.blue, "registered");
  this._services[name] = service;
}

Services.prototype.parseInjections = function(fn, context) {
  context = context || {};
  var match = fn.toString().match(/function[\s\w]+\(\s*([^\)]*)\s*\)/);
  var args = match[1];
  if (args==='') { args = []; } else { args = args.split(/\s*,\s*/); }
  var self = this;
  args = _.map(args, function(name) { return self.resolve(name); });

  var service = fn.apply(context, args);
  return service;
}

Services.prototype.resolve = function(name) {
  if (!this._services[name]) throw new Error('Unknow service '+name);
  if (typeof this._services[name] === 'function') {
    this._services[name] = this.parseInjections(this._services[name]);
  }
  return this._services[name];
}

Services.prototype.services = function() {
  return this._services;
}

module.exports = Services;
