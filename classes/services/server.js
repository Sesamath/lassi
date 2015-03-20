/**
 * Service de gestion du serveur HTTP
 * @namespace $server
 */
module.exports = function($settings, $rail) {
  var _http;
  var _server;

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
    _server = _http.listen(port, function() {
      lassi.log('$server', 'started on port', port.toString().blue);
      next();
    });
    function onTerminate() {
     //if (self.sessionStore) {
       //self.sessionStore.store();
     //}
     process.exit();
    }
    process.on('SIGTERM', onTerminate);
    process.on('SIGINT', onTerminate);
  }

  return {
    start : start
  }

}
