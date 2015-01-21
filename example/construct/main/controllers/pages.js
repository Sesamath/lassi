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

var controller = lassi.Controller().respond('html');

controller.Action('/', 'home')
  .do(function(next) {
    this.metas.title = 'Accueil';
    next(null, {message: 'Bienvenue !!'});
  });

controller.Action('private')
  .do(function(next) {
    this.metas.title = 'Zone privée';
    this.ensureAccess(lassi.action.user.login);
    next(null, {user: this.user});
  });

controller.Action('redirect')
  .do(function(ctx, next) {
    ctx.redirect('/');
  });
  
controller.Action('error404')
  .do(function(ctx, next) {
    this.metas.title = '404';
    ctx.notFound("Je n'existe pas, non non...");
  });

controller.Action('error403')
  .do(function(ctx, next) {
    this.metas.title = '403';
    ctx.accessDenied("Qui va là ?");
  });

controller.Action('error500')
  .do(function(ctx, next) {
    this.metas.title = '500';
    next(new Error('Ça va pas bien dans ma tête...'));
  });


module.exports = controller;
