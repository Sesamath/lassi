'use strict';
/*
 * @preserve This file is part of "arf-assertions".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "arf-assertions" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "arf-assertions" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "arf-assertions"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
require('colors');
var fs = require('fs');
function Validate() {}
Validate.not = {};
Validate.has = {};

/**
 * Check if subject is an instance of something.
 * @param {Object} subject subject to test.
 * @param {Object} classInstance instance to check with.
 */
Validate.instanceOf = function(subject, classInstance) {
  if (Validate.stringclassInstance) {
    return subject.constructor.name === classInstance;
  } else {
    return subject instanceof classInstance;
  }
}

/**
 * Check if subject is undefined (aka == undefined)
 * @param {Object} subject subject to test.
 */
Validate.undefined = function(subject) {
  return 'undefined' === typeof subject;
}

/**
 * Check if subject is defined (aka != undefined)
 * @param {Object} subject subject to test.
 */
Validate.defined = function(subject) {
  return !Validate.undefined(subject);
}

/**
 * Check if subject is not defined
 * @param {Object} subject subject to test.
 */
Validate.not.defined = function(subject) {
  return Validate.undefined(subject);
}

/**
 * Check if subject is a well formed string (not empty, defined, etc.)
 * @param {Object} subject subject to test.
 */
Validate.string = function(subject) {
  return toString.call(subject) === '[object String]';
}

var int = /^(?:-?(?:0|[1-9][0-9]*))$/
/**
 * Check if subject is numeric (even when it's a string).
 * @param {Object} subject subject to test.
 */
Validate.number = Validate.integer = Validate.numeric = function(subject) {
  return int.test(subject);
}



/**
 * Check if subject is a well formed array
 * @param {Object} subject subject to test.
 */
Validate.array = Array.isArray || function(subject) {
  return toString.call(subject) === '[object Array]';
}

/**
 * Check if subject is a well formed array
 * @param {Object} subject subject to test.
 */
Validate.not.array = function(subject) {
  return !Validate.array(subject);
}


/**
 * Check if subject is a well formed object
 * @param {Object} subject subject to test.
 */
Validate.object = function(subject) {
  return !Validate.array(subject) && (typeof subject == 'object');
}


/**
 * Check if subject is not empty (think php empty function)
 * @param {Object} subject subject to test.
 */
Validate.empty = function(subject) {
  return (
    Validate.undefined(subject) ||
    Validate.null(subject) ||
    (Validate.number(subject) && (subject===0)) ||
    (Validate.string(subject) && (subject==='')) ||
    (Validate.array(subject) && (subject.length===0)) ||
    (Validate.object(subject) && !Validate.has.keys(subject)));
}

Validate.not.empty = function(subject) {
  return !Validate.empty;
}

Validate.has.keys = function(subject) {
  for (var key in subject) if (subject.hasOwnProperty(key)) return true;
  return false;
};


/**
 * Check if subject is a function.
 * @param {Object} subject subject to test.
 */
Validate.function = function(subject) {
  return toString.call(subject) === '[object Function]';
}

/**
 * Check if subject is true
 * @param {Object} subject subject to test.
 */
Validate.true = function(subject) {
  return subject===true;
}

/**
 * Check if subject is false
 * @param {Object} subject subject to test.
 */
Validate.false = function(subject) {
  return subject===false;
}

/** helper */
function stringify(o) {
  return Validate.undefined(o)?'undefined':o.toString();
}

/**
 * Check if subject is equal to a value.
 * @param {Object} subject subject to test.
 * @param {Object} value the value
 */
Validate.equals = function(subject, value) {
  return stringify(subject)===stringify(value);
}

/**
 * Check if subject is lower than a value.
 * @param {Object} subject subject to test.
 * @param {Object} value value to compare with.
 */
Validate.lower = function(subject, value) {
  return subject<value;
}


/**
 * Check if subject is greater than a value.
 * @param {Object} subject subject to test.
 * @param {Object} value value to compare with.
 */
Validate.greater = function(subject, value) {
  return subject>value;
}


/**
 * Check if subject is a file and exists.
 * @param {String} subject subject to test.
 * @param {String=} message an optionnal message
 * @throws {Error} When the assertion fail.
 */
Validate.exists = function(subject) {
  return fs.existsSync(subject);
}

/**
 * Check if subject is not null.
 * @param {String} subject subject to test.
 */
Validate.not.null = function(subject) {
  return subject !== null;
}

/**
 * Check if subject is null.
 * @param {String} subject subject to test.
 */
Validate.null = function(subject) {
  return subject===null;
}

var email = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;
Validate.email = function(subject) {
  return  email.test(subject);
}
module.exports = Validate;


