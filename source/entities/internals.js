/**
 * This file is part of SesaXXX.
 *   Copyright 2014-2015, Association Sésamath
 *
 * SesaXXX is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 *
 * SesaXXX is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with SesaReactComponent (LICENCE.txt).
 * @see http://www.gnu.org/licenses/agpl.txt
 *
 *
 * Ce fichier fait partie de SesaReactComponent, créée par l'association Sésamath.
 *
 * SesaXXX est un logiciel libre ; vous pouvez le redistribuer ou le modifier suivant
 * les termes de la GNU Affero General Public License version 3 telle que publiée par la
 * Free Software Foundation.
 * SesaXXX est distribué dans l'espoir qu'il sera utile, mais SANS AUCUNE GARANTIE,
 * sans même la garantie tacite de QUALITÉ MARCHANDE ou d'ADÉQUATION à UN BUT PARTICULIER.
 * Consultez la GNU Affero General Public License pour plus de détails.
 * Vous devez avoir reçu une copie de la GNU General Public License en même temps que SesaQcm
 * (cf LICENCE.txt et http://vvlibri.org/fr/Analyse/gnu-affero-general-public-license-v3-analyse
 * pour une explication en français)
 */
'use strict'

const INDEX_TYPES = ['boolean', 'date', 'integer', 'string']

/**
 * cast de value en type
 * @param {*} value
 * @param {string} type boolean|string|integer|date
 * @return {*} value mise dans le type voulu
 * @throws si le type n'est pas boolean|string|integer|date
 */
function castToType (value, type) {
  if (typeof value === type) return value
  if (value === null || value === undefined) return value
  switch (type) {
    case 'boolean': value = !!value; break;
    case 'string': value = String(value);break;
    case 'integer': value =  Math.round(Number(value));break;
    case 'date':
      if (!(value instanceof Date)) {
        value = new Date(value);
      }
      break;
    default: throw new Error(`le type d’index ${type} n’est pas géré par Entity`); break;
  }
  return value;
}

/**
 * Retourne true si le type d'index est géré
 * @param {string} type
 * @return {boolean}
 */
function isAllowedIndexType (type) {
  return INDEX_TYPES.includes(type)
}

module.exports = {
  castToType,
  isAllowedIndexType
}
