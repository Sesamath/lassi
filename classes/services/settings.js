module.exports =

function() {
  var fs = require('fs');
  var _ = require('underscore')._;
  var _settings = {};
  var should       = require('../tools/Asserts');

  function load(root) {
    root = fs.realpathSync(root);
    var settingsPath = root+'/config';
    _settings = require(settingsPath);
    _settings.root = root;
    lassi.log('$settings', "loading", settingsPath.blue);

    should.object(_settings, 'La configuration doit être un objet');
    should.object(_settings.application, "Le champ 'application' n'est pas présent dans la configuration");
    should.string(_settings.application.name, "Le réglage 'application.name' doit être défini");
    should.string(_settings.application.mail, "Le réglage 'application.mail' doit être défini");

    _settings.application.root = root;
    _settings.application.settingsPath = settingsPath;

    // Paramétrage des slots de config par défaut
    _.defaults(_settings, {
      rail       : {},
      server     : {},
      services   : {}
    });

    // Paramétrage des options serveur par défaut
    _.defaults(_settings.server, { port: 3000 });
  }

  function get(path, def) {
    if (_.isString(path)) path = path.split(/\./);
    var current = _settings;
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

  return {
    get  : get,
    load : load
  }
}

