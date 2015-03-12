'use strict';
/*
* @preserve This file is part of "lassi".
*    Copyright 2009-2014,
*    Author :
*    eMail  :
*    Site   :
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
var _ = require('underscore')._;
var Head = require('./Head');

function Metas(metas) {
  this.robots = ['noodp'];
  this.breadcrumbs = [];
  this.css = [];
  this.js = [];
  _.extend(this, metas);
}

function stripTags(source) {
  return source.replace(/(<([^>]+)>)/ig,"");
}

Metas.prototype.head = function() {
  var head = new Head();
  // Section Asimov
  if (this.robots) {
    head.addMetaName('robots',  this.robots.join(','));
  }

  // Informations sur le site
  if (this.siteName) {
    head.addMetaProperty('og:site_name', this.siteName);
  }

  // Copyrights
  if (this.copyright) {
    head.addMetaName('copyright',  this.copyright);
  }

  // Flux RSS
  if (this.feeds) {
    _.each(this.feeds, function(title, url) {
      head.addLink('alternate', url, {type:'application/rss+xml', title: title});
    });
  }

  // Langue de la page
  if (this.language) {
    head.addMetaProperty('og:locale', this.language.replace('-', '_').toLowercase());
  }

  // Permalien
  if (this.permalink) {
    head.addLink('canonical', this.permalink);
    head.addMetaProperty('og:url', this.permalink);
  }

  // Shortlink
  if (this.shortlink) {
    head.addLink('shortlink', this.shortlink);
  }

  if (!this.pageTitle) {
    this.pageTitle = this.title;
  }

  // Titre de la page
  this.headTitle = this.pageTitle + ' | ' + this.siteName;

  head.add('title', {}, this.headTitle);

  // Titre du document
  if (this.title) {
    head.addMetaProperty('og:title', this.title);
    head.addMetaProperty('twitter:title', this.title.substr(0, 70));
  }

  // Dates
  if (this.publishTime) {
    head.addMetaProperty('article:publish_time', this.publishTime.toISOString());
  }
  if (this.updateTime) {
    head.addMetaProperty('article:modified_time', this.updateTime.toISOString());
  }

  // Illustration
  if (this.picture) {
    this.pictureUrl = this.picture;
    head.addLink('image_src', this.pictureUrl);
    head.addMetaProperty('og:image', this.pictureUrl);
    head.addMetaProperty('twitter:image', this.pictureUrl);
  }

  // Mots clefs
  if (this.keywords) {
    head.addMetaName('keywords',  this.keywords.join(',').toLowercase());
    this.keywords.forEach(function(keyword) {
      head.addMetaProperty('article:section', keyword);
    });
  }

  // Description du document
  if (this.description) {
    var description = stripTags(this.description).substr(0, 200)
    .trim()
    .replace(/(\r\n?|\n|&nbsp;|&amp;|&)/g, ' ')
    .replace(/\s+/g, ' ')
    .substr(0,150);
    description = stripTags(description);
    head.addMetaName('description',  description);
    head.addMetaProperty('twitter:description', description);
  }

  this.css.forEach(function(path) {
    head.addLink('stylesheet', '/'+path, {type:'text/css', media:'all'});
  }, this);

  var settings;
  _.each(this.js, function(path) {
    if (typeof path === 'string') {
      head.add('script', {type: 'text/javascript', src: path}, '');
    } else {
      if (!settings) settings = {};
      _.each(path, function(v,k) {
        settings[k] = v;
      });
    }
  });

  if (settings) {
    head.add('script', {type: 'text/javascript'}, 'settings = '+JSON.stringify(settings));
  }
  return head;
}

module.exports = Metas;
