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

require('lassi');
var assert = lassi.assert;

describe('actions', function() {
  // Création de l'application bidon
  var application = {
    transports: {},
    components: {}
  };
  application.transports.html = new lfw.framework.transport.HtmlTransport.Transport(application);


  // Création du composant
  var component = new lfw.framework.Component('test');
  component.bless(application, __dirname, '../test', {});
  application.components[component.name] = component;
  application.transports.html.wtf = true;
  application.transports.html.on('layout', function(useLayout) {
    useLayout(component, 'test-layout');
  })

  // Création du controller et ajout au composant
  var controller = new lfw.framework.Controller('test', component);
  controller.bless(__dirname, component);
  component.controllers.push(controller);

  // Création de l'action et association au controller
  var fooAction = new lfw.framework.Action('foo/:test');
  var action = new lfw.framework.Action(':test')
    .renderWith('test-view')
    .via('GET')
    .do(function(context, next) {
      try {
      assert.object(context);
      assert.object(context.arguments);
      assert.equals(context.arguments.test, 12);

      assert.equals(context.url(fooAction, {test:12}), '/test/foo/12');
      assert.equals(context.url(fooAction), '/test/foo/:test');
      assert.equals(context.url(), '/test/:test');
      assert.equals(context.url({test:12}), '/test/12');
      assert.equals(context.link(fooAction, 'toto', {test:12}), '<a href="/test/foo/12">toto</a>');
      assert.equals(context.link(fooAction, 'toto'), '<a href="/test/foo/:test">toto</a>');
      assert.equals(context.link('zou'), '<a href="/test/:test">zou</a>');
      assert.equals(context.link('zou', {test:12}), '<a href="/test/12">zou</a>');

      next({value: context.arguments.test});
      } catch (e) {
        console.log(e.message, e.stack);
        process.exit();
      }
    });
  action.bless(controller);
  fooAction.bless(controller);
  controller.actions.push(action);

  // Création du middleware
  var controllers = new lfw.framework.Controllers(application);
  var middleware = controllers.middleware();

  // Go...
  it('Réponse', function(done) {
    // Création de la requête de test
    var request = {
      query: {},
      body: {},
      method: 'get',
      url: 'http://truc/test/12'
    }
    var response = {
      send : function(result) {
        assert.equals(result, 'layout:value:12');
        done();
      }
    }
    middleware(request, response, function(error) {
      done(new Error('Rien à faire ici !!\n'+(error?error.message:'')));
    });
  });

});


