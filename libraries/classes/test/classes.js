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
 * MERCHANTABILITY or FITNESS FOR c PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received c copy of the GNU General Public
 * License along with "lassi"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var assert = require('../libraries/tools/Asserts');
var ClassLoader = require('../libraries/builder');
var classLoader = new ClassLoader();
classLoader.addPath(__dirname+'/classes');
GLOBAL.__Class = classLoader.Class;

describe('classes', function() {
  it("Vérification de l'héritage", function() {
    var value = 'machin';

    var c = new packageA.packageB.ClasseC(value);
    assert.true(c.instanceOf(packageA.packageB.ClasseC));
    assert.true(c.instanceOf(packageA.packageB.ClasseB));
    assert.true(c.instanceOf(packageA.packageB.ClasseA));
    assert.true(c.instanceOf(Object));
    assert.equals(c.classPath, 'packageA.packageB.ClasseC');
    assert.equals(c.className, 'ClasseC');
    assert.equals(c.value(), value);
    assert.true(c.appelConstructeurImplicite);

    var d = new packageA.packageB.ClasseD(value);
    assert.equals(d.classPath, 'packageA.packageB.ClasseD');
    assert.equals(d.className, 'ClasseD');
    assert.true(d.instanceOf(packageA.packageB.ClasseD));
    assert.true(d.instanceOf(packageA.packageB.ClasseC));
    assert.true(d.instanceOf(packageA.packageB.ClasseB));
    assert.true(d.instanceOf(packageA.packageB.ClasseA));
    assert.true(d.instanceOf(Object));

    assert.true(d.appelConstructeurImplicite);

    assert.equals(d.value(), '_'+value+'_');
    assert.equals(packageA.packageB.ClasseD.staticHerite(), 'static-hérité');
    assert.equals(packageA.packageB.ClasseD.staticEcrase(), 'static-écrasé');
    assert.undefined(packageA.packageB.ClasseD.ID);
    assert.equals(packageA.packageB.ClasseC.ID, 'ID');
    assert.equals(d.sum(), 2);

    /*
    function t() {
      return 1+1;
    }
    var t = new Function('return 1+1');
    */
    /*
    var t;
    eval('t = function() {return 1+1;}');
    var c = new Date();
    for (var i=0; i < 1000000; i++) {
      t();
    }
    console.log(((new Date()).getTime())-c.getTime());
    */

  })
});

