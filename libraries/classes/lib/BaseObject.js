/*
 * @preserve This file is part of "arf-classes".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "arf-classes" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "arf-classes" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "arf-classes"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

function BaseObject() {}


BaseObject.prototype.__definition = { extend: Object }

BaseObject.prototype.construct = function() {}

BaseObject.prototype.instanceOf = function(c) {
  var d = this.constructor.prototype.definition;
  var result = true;
  while (d.class != c) {
    d = d.extend;
    if (!d.prototype.definition) return d==c;
    d = d.prototype.definition;
  }
  return result;
}

Object.defineProperty(BaseObject.prototype, 'definition', {
  get:function() {
    return this.constructor.prototype.__definition;
  }
})

Object.defineProperty(BaseObject.prototype, 'className', {
  get:function() {
    return this.definition.className;
  }
})

Object.defineProperty(BaseObject.prototype, 'classPath', {
  get:function() {
    return this.definition.namespace.name+'.'+this.className;
  }
})

module.exports = BaseObject;

