#!/usr/bin/env node

'use strict';
/*
 * @preserve This file is part of "lassi".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

require('colors');
var _ = require('underscore')._;

var args = process.argv.slice(2);
function entitiesRebuildIndex(next) {
  require('lassi');
  var application = lassi.Application(process.cwd()+'/construct');
  application.on('loaded', function(type, name, object) {
    if (name != 'Application') return;
    application.entities.dropIndexes(function(error) {
      if (error) return next(error);
      application.entities.initializeStorage(function(error) {
        if (error) return next(error);
        var start = new Date;
        application.entities.rebuildIndexes(function(error) {
          if (error) return next(error);
          console.log('finito...', ((new Date)-start)/1000);
          //process.exit(0);
        });
      });
    });
  })
  application.boot(true);
}
var commands = {
  'help' : {
    description: "Show help",
    callback: function() {
      _.each(commands, function(command, name) {
        console.log('  - '+name.yellow+" : "+command.description);
      });
    }
  },
  'entities-rebuild-index' : {
    description: "Reconstruction de l'index des entités",
    execute: entitiesRebuildIndex
  }
}
require('lassi');
var application = lassi.Application(process.cwd()+'/construct');
application.on('loaded', function(type, name, object) {
  if (name != 'Application') return;
  _.each(application.components, function(component) {
    _.each(component.commands, function(cmd) {
      commands[cmd.name] = cmd;
    })
  })
  try {
    var command = args.shift();
    if (!command) throw new Error('Il me faut une commande !'.red);
    if (!_.has(commands, command)) throw new Error('Commande '.red+command.yellow+' inconnue !'.red);
    var argv = require('minimist')(args);
    commands[command].execute({argv:argv}, function(error) {
      if (error) {
        console.error(error.message);
        process.exit(1);
      }
      process.exit(0);
    });
  } catch(e) {
    console.error(e.message);
    commands.help.callback();
    process.exit(1);
  }


  switch (command) {
    case 'init':initialize(); break;
    case 'update':update(); break;
    case 'status':status(); break;
  }
});
application.boot(false);





