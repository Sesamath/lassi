var log = require('an-log')('$rail');
/**
 * Service de gestion des middlewares
 * @namespace $rail
 */
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
    log("adding", name.blue, "middleware");
    if (!settings) return;
    settings.mountPoint = settings.mountPoint || '/';

    /**
     * Évènement déclenché avant chargement d'un middleware.
     * @event Lassi#beforeRailUse
     * @param {Express}  rail express
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui seront appliqués au middleware
     */
    lassi.emit('beforeRailUse', _rail, name, settings);

    var middleware = callback(settings);
    if (!middleware) return;
    _rail.use(settings.mountPoint, middleware);

    /**
     * Évènement déclenché après chargement d'un middleware.
     * @event Lassi#afterRailUse
     * @param {Express}  rail express
     * @param {String}  name Le nom du middleware.
     * @param {Object} settings Les réglages qui ont été appliqués au middleware
     */
    lassi.emit('afterRailUse', _rail, name, settings, middleware);
  }

  /**
   * Initialisation du service utilisé par lassi lors
   * de la configuration du composant parent.
   *
   * @param callback next callback de retour
   * @memberof $rail
   * @private
   */
  function setup(next) {
    var railConfig = $settings.get('$rail');

    railUse('compression', function() {
      return require('compression')();
    }, railConfig.compression);

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
    var Controllers = require('../Controllers');
    var controllers = new Controllers(this);
    railUse('controllers', function() { return controllers.middleware() }, {});
    next();
  }

  return {
    setup: setup,
    /**
     * Renvoie la liste des middlewares en cours;
     * @return {Express} expres
     * @memberof $rail
     */
    get : function() { return _rail; }
  }

}
