'use strict';
/*
 * @preserve This file is part of "crap-collection".
 *    Copyright 2009-2014, arNuméral
 *    Author : Yoran Brault
 *    eMail  : yoran.brault@arnumeral.fr
 *    Site   : http://arnumeral.fr
 *
 * "crap-collection" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "crap-collection" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "crap-collection"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */

var _ = require('underscore')._;

lassi.Class('lfw.widgets.Pager', {
  /**
   * Classe permettant de créer un pager facilement.
   * Ce constructeur n'est pas appelé directement, mais passe
   * par {@link Context.Pager}
   * @param {Context} context Le contexte de réponse.
   * @param {Object=} settings Les réglages du pager
   *  - `current` La position courante du page. Par défault c'est 1.
   *  - `windowSize` Le nombre de pages affichés. Par défaut c'est 10.
   *  - `mainClass` La classe à donner au pager. Par défaut c'est 'pagination'.
   *  - `nextClass` La classe à donner au next. Par défaut c'est 'next'.
   *  - `previousClass` La classe à donner au previous. Par défaut c'est 'previous'.
   *  - `currentClass` La classe de l'élément actif. Par défaut c'est 'active'.
   *  - `nextText` La chaîne à utiliser pour le bouton next. Par défaut c'est un chevron.
   *  - `previousText` La chaîne à utiliser pour le bouton previous. Par défaut c'est un chevron.
   * @constructor
   */
  construct: function (context, settings) {
    this.context       = context;
    this.current       = 1;
    this.windowSize    = 10;
    this.mainClass     = 'pagination';
    this.nextClass     = 'next';
    this.previousClass = 'previous';
    this.currentClass  = 'active';
    this.nextText      = '»';
    this.previousText  = '«'
    _.extend(this, settings);
  },

  /**
   * Retourne la position courante du pager exprimé en item (et non en numero de page).
   * @return {Integer} la position.
   */
  position: function() {
    return (this.current-1)*this.rowsPerPage;
  },

  /**
   * Prépare le pager.
   * @private
   * @return {Array} Le pager préparé
   */
  prepare: function () {
    var first, middleStart, last, middleEnd;
    this.pagesCount = Math.ceil(this.rowsCount / this.rowsPerPage) || 1;

    if (this.current <= this.windowSize) {
      first = false;
      middleStart = 1;

      if (this.pagesCount <= this.windowSize + 3) {
        last = false;
        middleEnd = this.pagesCount;
      } else {
        last = true;
        middleEnd = this.windowSize + 1;
      }
    } else if (this.current > this.pagesCount - this.windowSize) {
      last = false;
      middleEnd = this.pagesCount;

      if (this.pagesCount <= this.windowSize + 3) {
        first = false;
        middleStart = 2;
      } else {
        first = true;
        middleStart = this.pagesCount - this.windowSize;
      }
    } else {
      first = true;
      last = true;
      middleStart = this.current - 1;
      middleEnd = this.current + 1;
    }

    return {
      first       : first,
      last        : last,
      middleStart : middleStart,
      middleEnd   : middleEnd
    };
  },

  /**
   * Effecture le rendu du markup du pager.
   * @return {String} Le markup.
   */
  render: function () {
    var html = '';
    var pos = {}
    var i;

    this.current = parseInt(this.current, 10);

    pos = this.prepare();

    if (this.pagesCount > 1) {
      html += "<ul class='" + this.mainClass + "'>";

      // PREV
      if (this.current === 1) {
        html += "<li class='" + this.previousClass + "'><span>" + this.previousText + "</span></li>";
      } else {
        html += "<li class='" + this.previousClass + "'><a href='" +
          this.url.replace(/%N/, this.current - 1) + "'>" + this.previousText + "</a></li>";
      }

      //FIRST
      if (pos.first) {
        html += "<li><a href='" + this.url.replace(/%N/, 1) + "'>1</a></li>";
        html += "<li><a href='" + this.url.replace(/%N/, 2) + "'>2</a></li>";
        html += "<li><span>...</span></li>";
      }

      // MIDDLE
      for (i = pos.middleStart; i <= pos.middleEnd; i += 1) {
        if (i === this.current) {
          html += "<li class='" + this.currentClass + "'><span>" + i + "</span></li>";
        } else {
          html += "<li><a href='" + this.context.url({}, {query: {page: i}}) + "'>" + i + "</a></li>";
        }
      }

      // LAST
      if (pos.last) {
        html += "<li><span>...</span></li>";
        html += "<li><a href='" + this.url.replace(/%N/, this.pagesCount - 1) +
          "'>" + (this.pagesCount - 1) + "</a></li>";
        html += "<li><a href='" + this.url.replace(/%N/, this.pagesCount) +
          "'>" + this.pagesCount + "</a></li>";
      }

      // NEXT
      if (this.current === this.pagesCount) {
        html += "<li class='" + this.nextClass + "'><span>" + this.nextText + "</span></li>";
      } else {
        html += "<li class='" + this.nextClass + "'><a href='" + this.url.replace(/%N/, this.current + 1) +
          "'>" + this.nextText + "</a></li>";
      }

      html += "</ul>";
    }

    return html;
  }
});

