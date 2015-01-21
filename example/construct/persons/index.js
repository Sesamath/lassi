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

var _ = require('underscore')._;
var flow = require('seq');

/** Juste une liste initialie de persons
 * à injecter dans la base à sa création
 */
var PERSONS = [
  { name: 'bob', password: 's', email: 'bob@example.com',
    born: new Date('01/11/1979'), bio: 'bla bla bla', interests: ['trucs', 'bidules']},
  { name: 'joe', password: 'b', email: 'joe@example.com',
    born: new Date('01/11/1980'), bio: 'bla bla', interests: ['machins', 'bidules']  },
  { name: 'pierre', password: 'b', email: 'pierre@example.com',
    born: new Date('01/11/1981'), bio: 'bla bla', interests: ['trucs', 'bidules']  },
  { name: 'marie', password: 'b', email: 'marie@example.com',
    born: new Date('01/11/1978'), bio: 'bla bla', interests: ['machins', 'trucs']  },
  { name: 'gaston', password: 'b', email: 'gaston@example.com',
    born: new Date('01/11/1978'), bio: 'bla bla', interests: ['bidies', 'trucs']  },
  { name: 'marguerite', password: 'b', email: 'marguerite@example.com',
    born: new Date('01/11/1986'), bio: 'bla bla', interests: ['bidies', 'lamouche']  }
];

/**
 * Dans l'initialisation du composant,
 */
var persons = lassi.Component();

persons.fill = function(next) {
  flow(PERSONS)
    .seqEach(function(data) {
      var _this = this;
      lassi.entity.Person.create(data).store(function(error, person) {
        if (error) return _this(error);
        lassi.log.info("new person added : %s %s", person.oid, person.name);
        _this();
      });
    })
    .empty()
    .seq(next)
    .catch(next);
}

module.exports = persons;

