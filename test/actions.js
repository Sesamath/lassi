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
  var component = new lfw.framework.Component('test');
  var controller = new lfw.framework.Controller('test');
  controller.bless(__dirname, component);
  var action = new lfw.framework.Action(':test')
    .renderWith('test1')
    .via('PUT');
  action.bless(controller);
  it('Correctement configuré', function() {
    assert.equals(action.path, '/test/:test');
    assert.equals(action.name, 'test');
    assert.equals(action.target, 'content');
    assert.equals(action.view, 'test1');
  })
  it('Mauvaise méthode', function() {
    var match = action.match('GET', '/test/12');
    assert.null(match);
  });
  it('Chemin avec argument', function() {
    var match = action.match('PUT', '/test/12');
    assert.not.null(match);
    assert.equals(match.test, 12);
  });

});


