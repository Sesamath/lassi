module.exports = function($settings) {
  var express = require('express');
  var _rail = express();


  /**
   * Wrapper permettant d'enregistrer un middleware sur le rail Express.
   * @fires Lassi#beforeRailUse
   * @fires Lassi#afterRailUse
   * @private
   */
  function railUse(name, callback, settings) {
    lassi.log('$rail', "adding", name.blue, "middleware");
    if (!settings) return;
    settings.mountPoint = settings.mountPoint || '/';

    /**
     * Évènement déclenché avant chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui seront appliqués au middleware
     */
    lassi.emit('beforeRailUse', name, settings);

    var middleware = callback(settings);
    if (!middleware) return;
    _rail.use(settings.mountPoint, middleware);

    /**
     * Évènement déclenché après chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui ont été appliqués au middleware
     */
    lassi.emit('afterRailUse', name, settings, middleware);
  }

  function setup(next) {
    var railConfig = $settings.get('rail');

    railUse('compression', function() {
      return require('compression')();
    }, railConfig.compression);

    _rail.use(function(request, response, next) {
      console.log("request: "+request.url);
      next();
    });


    // Gestion des sessions
    railUse('cookie', function(settings) {
      return require('cookie-parser')(settings.key)
    }, railConfig.cookie);

    var bodyParser = require('body-parser');
    var dateRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;
    railUse('body-parser',
      function(settings) {
        return bodyParser(settings);
      },
      railConfig.bodyParser || {
        reviver: function (key, value) {
          if (typeof value === 'string') {
            if (dateRegExp.exec(value)) {
              return new Date(value);
            }
          }
          return value;
        }
      }
    );

    railUse('session', function(settings) {
      var session = require('express-session');
      var SessionStore = require('../SessionStore');
      settings.store = new SessionStore();
      return session(settings);
    }, railConfig.session);

    // Ajout du router principal
    var Controllers = require('../middlewares/Controllers');
    var controllers = new Controllers(this);
    railUse('controllers', function() { return controllers.middleware() }, {});

    // Lorsqu'il n'y a plus d'espoir...
    var CapitaineFlam = require('../middlewares/CapitaineFlam');
    var capitaineFlam = new CapitaineFlam();
    railUse('errors', function() { return capitaineFlam.middleware() }, {});
    next();
  }

  return {
    setup: setup,
    get : function() { return _rail; }
  }

}
