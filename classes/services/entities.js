module.exports = function($settings) {
  var Entities = require('../entities');
  var entities = new Entities($settings.get('entities'));
  entities.setup = function(cb) {
    entities.initialize(cb);
  }
  return entities;
}

