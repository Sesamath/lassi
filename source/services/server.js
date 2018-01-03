"use strict";
var log = require('an-log')('$server');
var constantes = require('../constantes')

/**
 * Service de gestion du serveur HTTP
 * @namespace $server
 */
module.exports = function($settings, $rail) {
  var _http;

  /**
   * Déparrage du serveur.
   *
   * @param callback next callback de retour
   * @memberof $server
   */
  function start(next) {
    var port = $settings.get('$server.port', 3000);
    // 5 min max par défaut, lassi doit couper avant
    // +1000 pour laisser lassi prendre la main sur un timeout de 5min
    var maxTimeout = $settings.get('$server.maxTimeout', constantes.maxTimeout);
    _http = require('http').Server($rail.get());
    _http.timeout = maxTimeout
    lassi.emit('httpReady', _http);
    _http.listen(port, function() {
      log('started', 'on port', port.toString().blue, 'with pid ' + process.pid + ' and timeout ' + maxTimeout +'ms');
      next();
    });
  }

  /**
   * Arrêt du serveur http
   * @param {function} [next] callback appelé avec une éventuelle erreur
   */
  function stop(next) {
    if (_http) {
      _http.close(function (error) {
        if (error) console.error(error.stack || error)
        log('closed')
        if (next) next(error)
      })
    } else {
      const error = new Error('Http server already closed or never started')
      if (next) next(error)
      else console.error(error)
    }
  }

  return {
    start : start,
    stop : stop
  }
}

