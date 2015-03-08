'use strict';
/*
 * @preserve This file is part of "node-lassi-example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "node-lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "node-lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "node-lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
var seq = require('seq');
lassi.component('example-entities')
  .entity('Person', function() {
    this.construct(function() {
      this.name = undefined;
      this.truc = 'machin';
    })

    this.beforeStore(function(cb) {
      this.rand = Math.random();
      cb();
    })

    this.afterStore(function(cb) {
      this.$id = this.name+'::'+this.oid;
      cb();
    })

    this.afterLoad(function(cb) {
      this.$loaded = new Date();
      cb();
    })

    this.defineIndex('name', 'string');
  })
  .controller('api', function(Person) {
    this.get('person', function(context) {
      seq()
        .seq(function() { Person.create({name:'gaston'}).store(this); })
        .seq(function() { Person.match('name').equals('gaston').grab(this); })
        .seq(function(gastons) {
          context.next({gastons: gastons});
        })
        .catch(context.next);
    });
  });
