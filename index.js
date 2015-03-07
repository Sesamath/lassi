module.exports = function(root) {
  var Lassi = require('./classes/Lassi');
  GLOBAL.lassi = new Lassi(root);
}

//require('./classes/Emitter')(lassi);

//lassi.tools = require('./libraries/tools');

//var classes = require('./libraries/classes');
//lassi.classPath = new classes.ClassPath();
//lassi.classPath.addPath(__dirname+'/classes');
//lassi.Class = classes.Class;
//lassi.Emitter = classes.Emitter;

//lassi.Application = require('./classes/Application');
//lassi.Controller  = require('./classes/Controller');
//lassi.Decorator   = require('./classes/Decorator');
//var CacheManager = require('./classes/cache');
//lassi.cache = new CacheManager();
//lassi.Cache = function() { lassi.cache.addEngine.apply(lassi.cache, arguments); }

//var Entities = require('./classes/entities');
//lassi.entity = new Entities();
//lassi.Entity = function(name) { return lassi.entity.create(name); }

//lassi.require = function() {
  //return require.apply(this, Array.prototype.slice.call(arguments));
//}

//var Logger      = require('./libraries/logger');
//lassi.log = new Logger();

//lassi.assert = require('./libraries/assertions').assert;
//lassi.validate = require('./libraries/assertions').validate;


//lassi.fs = require('fs');

//var pathlib = require('path');
//var mkdirp = require('mkdirp').mkdirp;
//function copyFile(source, target, cb) {
  //var cbCalled = false;

  //var rd = lassi.fs.createReadStream(source);
  //rd.on("error", function(err) {
    //done(err);
  //});
  //var wr = lassi.fs.createWriteStream(target);
  //wr.on("error", function(err) { done(err); });
  //wr.on("close", function() { done(); });
  //rd.pipe(wr);

  //function done(err) {
    //if (!cbCalled) {
      //cb(err);
      //cbCalled = true;
    //}
  //}
//}

//function preparePath(filename, callback) {
  //mkdirp(pathlib.dirname(filename), callback);
//}
//function preparePathSync(filename) {
  //mkdirp.sync(pathlib.dirname(filename));
//}

//for (var key in pathlib) {
  //if (key != 'exists' && key != 'existsSync') {
    //lassi.fs[key] = pathlib[key];
  //}
//}
//lassi.fs.copy = copyFile;
//lassi.fs.mkdirp = mkdirp;
//lassi.fs.mkdirpSync = mkdirp.sync;
//lassi.fs.preparePath = preparePath;
//lassi.fs.preparePathSync = preparePathSync;
//lassi.fs.prune = function (path) {
  //var files = [];
  //if (lassi.fs.existsSync(path)) {
    //files = lassi.fs.readdirSync(path);
    //files.forEach(function (file) {
      //var curPath = path + "/" + file;
      //if (lassi.fs.lstatSync(curPath).isDirectory())
        //lassi.fs.prune(curPath);
      //else
        //lassi.fs.unlinkSync(curPath);
    //});
    //lassi.fs.rmdirSync(path);
  //}
//}



