'use strict';
/*
 * @preserve This file is part of "lassi-example".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "lassi-example" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "lassi-example" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "lassi-example"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

lassi.Entity('Person', {
  construct: function() {
    this.email     = undefined;
    this.password  = undefined;
    this.name      = undefined;
    this.birthday  = undefined;
    this.interests = [];
    this.bio       = '';
  },
  members: {
    getAge: function() {
      return (new Date()).getFullYear() - new Date(this.birthday).getFullYear();
    }
  },

  configure: function() {
    this
      .on('beforeStorage', function() {
        this.changed = new Date();
        if (!this.created) this.created = this.changed;
      })
      .defineIndex('birthday', 'date')
      .defineIndex('name', 'string')
      .defineIndex('email', 'string')
      .defineIndex('interests', 'string')
      .defineIndex('age', 'integer', function() {
        return this.getAge();
      })
      .defineIndex('year', 'integer', function() {
        return new Date(this.birthday).getFullYear();
      });
  },

  grabByEmail : function(email, callback) {
    lassi.entity.Person
    .match('email').equals(email)
    .grabOne(function(error, person) {
      if (error) return callback(error);
      callback(null, person);
    });
  }
});



