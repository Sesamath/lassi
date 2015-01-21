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

lassi.Class('lfw.framework.Decorator', {
  construct: function(name) {
    this.callbacks      = new lfw.tools.Callbacks();
    this.weight = 0;
    if (name) {
      this.name = name;
      lassi.tools.register('block.'+name, this);
    }
  },
  filter: function(value) {
    this._filter = value;
    return this;
  },

  renderTo: function(target, weight) {
    this.weight = weight || 0;
    this.target = target;
    return this;
  },

  renderWith: function(view) {
    this.view = view;
    return this;
  },


  do: function(callback, options) {
    this.callbacks.do(callback, options);
    return this;
  },

  bless: function(file, component) {
    this.component = component;
    this.name = this.name || file.replace('.js', '');
    this.view = this.view || lassi.tools.toUnderscore(this.name).replace('_', '-');
    this.layout = this.layout || 'sidebar';
    this.callbacks.name = this.name;
    return this;
  },

 /**
  * Lance les callbacks successivement pour nourrir response avant de lancer
  * next (filtre un post de form éventuel au passage)
  */
  execute: function(context, next) {
    this.callbacks.execute(context, next);
  }
});

