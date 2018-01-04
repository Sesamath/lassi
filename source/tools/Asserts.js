'use strict'
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
require('colors')
var util = require('util')
var _ = require('lodash')
function Asserts () {}
Asserts.not = {}
var is = require('./Validate')

/**
 * @constructor
 */
function AssertError (message) {
  function grabStack () {
    var orig = Error.prepareStackTrace
    Error.prepareStackTrace = function (foo, stack) { return stack }
    var err = new Error()
    Error.captureStackTrace(err, grabStack)
    var stack = err.stack
    Error.prepareStackTrace = orig
    return stack
  }
  this.constructor.prototype.__proto__ = Error.prototype
  Error.call(this)
  var stack = grabStack()
  Error.captureStackTrace(this, stack[1].fun)
  this.name = 'Assertion Error'.yellow
  if (is.object(message)) {
    _.extend(this, message)
  } else {
    this.message = message
  }
}

/**
 * Check if subject is an instance of something.
 * @param {Object} subject subject to test.
 * @param {Object} classInstance instance to check with.
 * @param {String=} message the human name of subject
 * @throws {Error} When the assertion fail.
 */
Asserts.instanceOf = function (subject, classInstance, message) {
  message = message || util.format("%s should be instance of %s, but it's %s", stringify(subject), classInstance.name, subject.constructor.name)
  if (!is.instanceOf(subject, classInstance)) throw new AssertError(message)
}

/**
 * Check if subject is undefined (aka == undefined)
 * @param {Object} subject subject to test.
 * @param {String=} message message
 * @throws {Error} When the assertion fail.
 */
Asserts.undefined = function (subject, message) {
  message = message || util.format('%s should be undefined', stringify(subject))
  if (is.defined(subject)) throw new AssertError(message)
}

/**
 * Check if subject is defined (aka != undefined)
 * @param {Object} subject subject to test.
 * @param {String=} message message
 * @throws {Error} When the assertion fail.
 */
Asserts.defined = function (subject, message) {
  message = message || 'Subject should not be undefined'
  if (is.undefined(subject)) throw new AssertError(message)
}

/**
 * Check if subject is not defined
 * @param {Object} subject subject to test.
 * @param {String=} message message
 * @throws {Error} When the assertion fail.
 */
Asserts.not.defined = function (subject, message) {
  message = message || 'subject should not be defined'
  if (is.defined(subject)) throw new AssertError(message)
}

/**
 * Check if subject is a well formed string (not empty, defined, etc.)
 * @param {Object} subject subject to test.
 * @param {String=|Object=} message If a string, it's a message, else everything is injected to exception
 * @param {Object=} more More data to inject in Exception.
 * @throws {Error} When the assertion fail.
 */
Asserts.string = function (subject, message) {
  message = message || util.format("%s should be a string, and it's not", stringify(subject))
  if (!is.string(subject)) throw new AssertError(message)
}

/**
 * Check if subject is numeric (even when it's a string).
 * @param {Object} subject subject to test.
 * @param {String=|Object=} message If a string, it's a message, else everything is injected to exception
 * @param {Object=} more More data to inject in Exception.
 * @throws {Error} When the assertion fail.
 */
Asserts.numeric = function (subject, message) {
  message = message || util.format("%s should be a numeric, and it's not", stringify(subject))
  if (!is.number(subject)) throw new AssertError(message)
}

/**
 * Check if subject is a well formed array
 * @param {Object} subject subject to test.
 * @param {String} message message on faillure.
 * @throws {Error} When the assertion fail.
 */
Asserts.array = function (subject, message) {
  message = message || util.format("%s should be an array, and it's not.", stringify(subject))
  if (!is.array(subject)) throw new AssertError(message)
}

/**
 * Check if subject is a well formed array
 * @param {Object} subject subject to test.
 * @param {String} message message on faillure.
 * @throws {Error} When the assertion fail.
 */
Asserts.not.array = function (subject, message) {
  message = message || util.format("%s should not be an array, and it's", stringify(subject))
  if (is.array(subject)) throw new AssertError(message)
}

/**
 * Check if subject is a well formed object
 * @param {Object} subject subject to test.
 * @param {String} message message on faillure.
 * @throws {Error} When the assertion fail.
 */
Asserts.object = function (subject, message) {
  message = message || util.format("%s should be an object, and it's not", stringify(subject))
  if (!is.object(subject)) throw new AssertError(message)
}

/**
 * Check if subject is not empty (think php empty function)
 * @param {Object} subject subject to test.
 * @param {String=} message message on error
 * @throws {Error} When the assertion fail.
 */
Asserts.not.empty = function (subject, message) {
  message = message || util.format('%s should not be empty', stringify(subject))
  if (is.empty(subject)) throw new AssertError(message)
}

/**
 * Check if subject is a function.
 * @param {Object} subject subject to test.
 * @param {String=} message fail case message.
 * @throws {Error} When the assertion fail.
 */
Asserts.function = function (subject, message) {
  message = message || util.format('%s should be a function', stringify(subject))
  if (!is.function(subject)) throw new AssertError(message)
}

/**
 * Check if subject is true
 * @param {Object} subject subject to test.
 * @param {String} message faillure message.
 * @param {Function} name start function for the call stack.
 * @throws {Error} When the assertion fail.
 */
Asserts.true = function (subject, message) {
  message = message || util.format('%s should be true, but is not', stringify(subject))
  if (subject !== true) throw new AssertError(message)
}

/**
 * Check if subject is false
 * @param {Object} subject subject to test.
 * @param {String} message faillure message.
 * @param {Function} name start function for the call stack.
 * @throws {Error} When the assertion fail.
 */
Asserts.false = function (subject, message) {
  message = message || util.format('%s should be true, but is not', stringify(subject))
  if (subject !== false) throw new AssertError(message)
}

/** helper */
function stringify (o) {
  return is.undefined(o) ? 'undefined' : o.toString()
}
/**
 * Check if subject is equal to a value.
 * @param {Object} subject subject to test.
 * @param {Object} value the value
 * @param {String=} message a message when assertion fail
 * @throws {Error} When the assertion fail.
 */
Asserts.equals = function (subject, value, message) {
  message = message || util.format('%s should be equals to %s', stringify(subject).red, stringify(value).red)
  if (!is.equals(subject, value)) throw new AssertError(message)
}

/**
 * Check if subject is lower than a value.
 * @param {Object} subject subject to test.
 * @param {Object} value value to compare with.
 * @param {String=} message an optionnal message
 * @throws {Error} When the assertion fail.
 */
Asserts.lower = function (subject, value, message) {
  message = message || util.format('%s should be lower than %s', stringify(subject).red, stringify(value).red)
  if (subject > value) throw new AssertError(message)
}

/**
 * Check if subject is greater than a value.
 * @param {Object} subject subject to test.
 * @param {Object} value value to compare with.
 * @param {String=} message an optionnal message
 * @throws {Error} When the assertion fail.
 */
Asserts.greater = function (subject, value, message) {
  message = message || util.format('%s should be greater than %s', stringify(subject).red, stringify(value).red)
  if (subject < value) throw new AssertError(message)
}

/**
 * Check if subject is a file and exists.
 * @param {String} subject subject to test.
 * @param {String=} message an optionnal message
 * @throws {Error} When the assertion fail.
 */
Asserts.exists = function (subject, message) {
  message = message || util.format('%s should exists', subject.red)
  if (!is.exists(subject)) throw new AssertError(message)
}

/**
 * Check if subject is not null.
 * @param {String} subject subject to test.
 * @param {String=} message an optionnal message
 * @throws {Error} When the assertion fail.
 */
Asserts.not.null = function (subject, message) {
  message = message || util.format('%s should not be null', subject)
  if (subject === null) throw new AssertError(message)
}

/**
 * Check if subject is null.
 * @param {String} subject subject to test.
 * @param {String=} message an optionnal message
 * @throws {Error} When the assertion fail.
 */
Asserts.null = function (subject, message) {
  message = message || util.format('%s should be null', subject)
  if (subject !== null) throw new AssertError(message)
}

module.exports = Asserts
