var _ = require('underscore')._;

function Services() {
  this.services = {};
}

Services.prototype.register = function(name, service) {
  if (this.services[name]) throw new Error('Already registered service '+name);
  console.log("register ", name);
  this.services[name] = service;
}

Services.prototype.parseInjections = function(fn, context) {
  context = context || {};
  var match = fn.toString().match(/function\s+\(\s*([^\)]*)\s*\)/);
  var args = match[1];
  if (args==='') { args = []; } else { args = args.split(/\s*,\s*/); }
  var self = this;
  args = _.map(args, function(name) { return self.resolve(name); });

  var service = fn.apply(context, args);
  return service;
}

Services.prototype.resolve = function(name) {
  if (!this.services[name]) throw new Error('Unknow service '+name);
  if (typeof this.services[name] === 'function') {
    this.services[name] = this.parseInjections(this.services[name]);
  }
  return this.services[name];
}

module.exports = Services;
