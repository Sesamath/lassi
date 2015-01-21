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

describe('callback', function() {
  it('Callbacks sans argument', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1() { return {res1:this.proof++} });
    callbacks.do(function callback2() { return {res2:this.proof++} });
    callbacks.do(function callback3() { return {res3:this.proof++} });
    callbacks.execute(context, function(error, result) {
      if (error) return done(error);
      assert.equals(result.res1, 0);
      assert.equals(result.res2, 1);
      assert.equals(result.res3, 2);
      assert.equals(context.proof, 3);
      done();
    });
  })

  it('Callbacks sans argument et plantage', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1() { return {res1:this.proof++} });
    callbacks.do(function callback2() { throw new Error('Ça plante') });
    callbacks.do(function callback3() { return {res3:this.proof++} });
    callbacks.execute(context, function(error, result) {
      assert.instanceOf(error, Error);
      assert.equals(context.proof, 1);
      done();
    });
  })


  it('Callbacks 1 argument', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(next) { next(null, {res1:this.proof++}) });
    callbacks.do(function callback2(next) { next(null, {res2:this.proof++}) });
    callbacks.do(function callback3(next) { next(null, {res3:this.proof++}) });
    callbacks.execute(context, function(error, result) {
      if (error) return done(error);
      assert.equals(result.res1, 0);
      assert.equals(result.res2, 1);
      assert.equals(result.res3, 2);
      assert.equals(context.proof, 3);
      done();
    });
  })

  it('Callbacks 1 argument et plantage', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(next) { next(null, {res1:this.proof++}) });
    callbacks.do(function callback2(next) { next(new Error('ça plante')) });
    callbacks.do(function callback3(next) { next(null, {res3:this.proof++}) });
    callbacks.execute(context, function(error, result) {
      assert.instanceOf(error, Error);
      assert.equals(context.proof, 1);
      done();
    });
  })

  it('Callbacks 2 argument', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(context, next) { next(null, {res1:context.proof++}) });
    callbacks.do(function callback2(context, next) { next(null, {res2:context.proof++}) });
    callbacks.do(function callback3(context, next) { next(null, {res3:context.proof++}) });
    callbacks.execute(context, function(error, result) {
      if (error) return done(error);
      assert.equals(result.res1, 0);
      assert.equals(result.res2, 1);
      assert.equals(result.res3, 2);
      assert.equals(context.proof, 3);
      done();
    });
  })

  it('Callbacks 2 argument et plantage', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(context, next) { next(null, {res2:context.proof++}) });
    callbacks.do(function callback2(context, next) { next(new Error('ça plante')) });
    callbacks.do(function callback3(context, next) { next(null, {res3:context.proof++}) });
    callbacks.execute(context, function(error, result) {
      assert.instanceOf(error, Error);
      assert.equals(context.proof, 1);
      done();
    });
  })

  it('Callbacks 2 argument avec détermination du résultat', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(context, next) { next({res1:context.proof++}) });
    callbacks.do(function callback2(context, next) { next({res2:context.proof++}) });
    callbacks.do(function callback3(context, next) { next({res3:context.proof++}) });
    callbacks.execute(context, function(error, result) {
      if (error) return done(error);
      assert.equals(result.res1, 0);
      assert.equals(result.res2, 1);
      assert.equals(result.res3, 2);
      assert.equals(context.proof, 3);
      done();
    });
  })

  it('Callbacks 2 argument avec détermination du résultat et plantage', function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(context, next) { next({res2:context.proof++}) });
    callbacks.do(function callback2(context, next) { next(new Error('ça plante')) });
    callbacks.do(function callback3(context, next) { next({res3:context.proof++}) });
    callbacks.execute(context, function(error, result) {
      assert.instanceOf(error, Error);
      assert.equals(context.proof, 1);
      done();
    });
  })

  it("Cas d'oubli de l'appel à done()", function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(context, next) { next({res2:context.proof++}) });
    callbacks.do(function callback2(context, next) { /* Ici on a oublié le next() */ });
    callbacks.do(function callback3(context, next) { next({res3:context.proof++}) });
    callbacks.execute(context, function(error, result) {
      assert.instanceOf(error, Error);
      assert.true(error.message.indexOf('Timeout')!==-1);
      assert.equals(context.proof, 1);
      done();
    });
  })

  it("Cas d'une arrivée de résultat après la fin d'un timeout", function(done) {
    var context = {proof: 0};
    var callbacks = new lfw.tools.Callbacks();
    callbacks.do(function callback1(context, next) { next({res2:context.proof++}) });
    callbacks.do(function callback2(context, next) {
       setTimeout(function() {
        next({res3:context.proof++});
       }, 800)
    }, {timeout: 500});
    callbacks.do(function callback3(context, next) {
      next({res3:context.proof++}) });
    callbacks.execute(context, function(error, result) {
      setTimeout(function() {
        assert.instanceOf(error, Error);
        assert.true(error.message.indexOf('Timeout')!==-1);
        assert.equals(context.proof, 2);
        done();
      }, 400);
    });
  })


});
