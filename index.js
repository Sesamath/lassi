GLOBAL.lassi = module.exports = {};

var classes = require('./libraries/classes');
lassi.classPath = new classes.ClassPath();
lassi.classPath.addPath(__dirname+'/classes');
lassi.Class = classes.Class;
lassi.Emitter = classes.Emitter;

lassi.Application = function(root) { return new lfw.framework.Application(root); }
lassi.Component   = function(name, root) { return new lfw.framework.Component(name, root); }
lassi.Decorator   = function(name, definition) {
  if ('undefined' === typeof definition) {
    return new lfw.framework.Decorator(name);
  } else {
    definition.extend = definition.extend || lfw.framework.Decorator;
    var decoratorClass = lassi.Class(name, definition);
    var decoratorInstance = new decoratorClass();
    return decoratorInstance;
  }
}

lassi.Controller  = function(path) {
  return new lfw.framework.Controller(path);
}
// NOTE: name est unique car la table est unique, donc on oublie les
// sesamath.truc.machin.entity sauf à vouloit inclure le path
// complet comme nom de table...
lassi.Entity = function(name, definition) {
  definition.extend = definition.extend || lfw.entities.Entity;
  var configure = definition.configure || function() {};
  delete definition.configure;
  var entityClass = lassi.Class(name, definition);

  var entityDefinitionClass = lassi.Class(name+'Definition', {
    extend: lfw.entities.Definition,
    construct: function(entityClass) {
      this.parent(entityClass);
    },
    configure: configure
  });

  return lassi.tools.register('lassi.entity.'+name, new entityDefinitionClass(entityClass));
}

lassi.require = function() {
  return require.apply(this, Array.prototype.slice.call(arguments));
}

lassi.Staging = {
  development : 'development',
  integration : 'integration',
  production  : 'production'
}

var Logger      = require('./libraries/logger');
lassi.log = new Logger();

lassi.assert = require('./libraries/assertions').assert;
lassi.validate = require('./libraries/assertions').validate;
lassi.tools = require('./libraries/tools');

lassi.cache = new lfw.cache.Manager();

lassi.fs = require('fs');

var pathlib = require('path');
var mkdirp = require('mkdirp').mkdirp;
function copyFile(source, target, cb) {
  var cbCalled = false;

  var rd = lassi.fs.createReadStream(source);
  rd.on("error", function(err) {
    done(err);
  });
  var wr = lassi.fs.createWriteStream(target);
  wr.on("error", function(err) { done(err); });
  wr.on("close", function() { done(); });
  rd.pipe(wr);

  function done(err) {
    if (!cbCalled) {
      cb(err);
      cbCalled = true;
    }
  }
}

function preparePath(filename, callback) {
  mkdirp(pathlib.dirname(filename), callback);
}
function preparePathSync(filename) {
  mkdirp.sync(pathlib.dirname(filename));
}

for (var key in pathlib) {
  if (key != 'exists' && key != 'existsSync') {
    lassi.fs[key] = pathlib[key];
  }
}
lassi.fs.copy = copyFile;
lassi.fs.mkdirp = mkdirp;
lassi.fs.mkdirpSync = mkdirp.sync;
lassi.fs.preparePath = preparePath;
lassi.fs.preparePathSync = preparePathSync;
lassi.fs.prune = function (path) {
  var files = [];
  if (lassi.fs.existsSync(path)) {
    files = lassi.fs.readdirSync(path);
    files.forEach(function (file) {
      var curPath = path + "/" + file;
      if (lassi.fs.lstatSync(curPath).isDirectory())
        lassi.fs.prune(curPath);
      else
        lassi.fs.unlinkSync(curPath);
    });
    lassi.fs.rmdirSync(path);
  }
}



