/**
 * Service de gestion des réglages de lassi
 * @namespace $settings
 */
module.exports = function() {
  var _            = require('lodash');
  var should       = require('../tools/Asserts');

  function initialize() {
    should.object(lassi.settings, 'La configuration doit être un objet');
    should.object(lassi.settings.application, "Le champ 'application' n'est pas présent dans la configuration");
    should.string(lassi.settings.application.name, "Le réglage 'application.name' doit être défini");
    should.string(lassi.settings.application.mail, "Le réglage 'application.mail' doit être défini");

    // Paramétrage des slots de config par défaut
    _.defaults(lassi.settings, {
      rail       : {},
      server     : {},
      services   : {}
    });

    // Paramétrage des options serveur par défaut
    _.defaults(lassi.settings.server, { port: 3000 });
  }

  /**
   * Chargement des réglages à partir de la racine.
   * @param {String} path Le chemin du réglage (ex. application.mail)
   * @param {mixed} def La valeur à renvoyer si le chemin n'existe pas.
   * @return {mixed} la valeur du réglage
   * @memberof $settings
   */
  function get(path, def) {
    if (_.isString(path)) path = path.split(/\./);
    var current = lassi.settings;
    while(path.length) {
      var part = path.shift();
      if (current[part]) {
        current = current[part];
      } else {
        current = def;
        break;
      }
    }
    return current;
  }

  initialize();
  return {
    get  : get
  }
}

