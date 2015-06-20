"use strict";
var log = require('an-log')('$server');
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
    var port = $settings.get('$server.port') || 3000;
    _http = require('http').Server($rail.get());
    lassi.emit('httpReady', _http);
    _http.listen(port, function() {
      log('started', 'on port', port.toString().blue, 'with pid ' +process.pid);
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
      log('already closed or never started')
      if (next) next(new Error('Http server already closed or never started'))
    }
  }

  return {
    start : start,
    stop : stop
  }
}

