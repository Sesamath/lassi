"use strict";
/*
 * This file is part of "node-lassi-example".
 *    Copyright 2009-2012, arNuméral
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

var controller = lassi.Controller('persons').respond('html');
var _ = require('underscore')._;

controller.Action('list')
  .do(function(ctx, next) {
    this.metas.title = 'Liste des personnes';
    lassi.entity.Person
    //.match('interests').with('bidies')
    //.match('age').greaterThan(20)
    //.match('birthday').before(Date('Thu Jul 17 1980 12:06:12 GMT+0200 (CEST)'))
    .sort('age')
    .grab(function(error, persons) {
      _.each(persons, function(person) {
        person.actions = [
          ctx.link(lassi.action.persons.view, 'Voir', {oid: person.oid})
        ];
      });
      next(null, {
        persons: persons,
        actions: [
          ctx.link(lassi.action.persons.add, 'Ajouter une personne')
        ]
      });
    });
  });

controller.Action('view/:oid')
  .do(function(next) {
    lassi.entity.Person
      .match('oid').with(this.arguments.oid)
      .grabOne(function(error, result) {
        next(error, {person:result});
      })
  });

controller.Action('add')
  .via('get', 'post')
  .do(function(next) {
    var _this = this;
    var result = {
      errors: 0,
      name : { value: '' },
      born: { value: '' },
      email: { value: '' },
      interests: { value: '' },
      bio: { value: '' },
    }
    function error(field, message) {
      result.errors++;
      result[field].error = true;
      result[field].help = message;
    }
    if (this.isPost()) {
      var values = _.clone(this.post);
      if (values.name==='') error('name', "This can't be nobody !");
      if (values.born==='') {
        error('born', "Only god isn't born");
      } else {
        values.born = new Date(values.born);
      }
      if (values.email==='') error('email', 'We need an email to spam you !');
      if (values.interests==='') {
        error('interests', 'We are not interested with someone with no interests in life');
      } else {
        values.interests = values.interests.split(/\s*,\s*/);
      }
      if (values.password==='') error('password', 'We need a weak password here, try foo or something');
      if (values.bio==='') error('bio', "This can't be that empty !");
      for(var field in this.post) {
        result[field].value = this.post[field];
      }
      if (result.errors == 0) {
        var person = lassi.entity.Person.create(values).store(function(error, person) {
          if (error) {
            result.message = error.message;
            next(null, result);
          } else {
            _this.redirect(lassi.action.persons.view, {oid: person.oid});
          }
        });
      } else {
        next(null, result);
      }
    } else {
      next(null, result);
    }
  });

module.exports = controller;

