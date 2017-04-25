'use strict';
/*
 * @preserve This file is part of "labomep".
 *    Copyright 2009-2014,
 *    Author :
 *    eMail  :
 *    Site   :
 *
 * "labomep" is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * "labomep" is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with "labomep"; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
// Configuration de la base de données
module.exports = {
  application : {
    name: 'Bang Lassi',
    staging: 'dev',
    mail: 'toto',
    defaultViewsPath: 'test',
    // nom du dossier où on ira chercher les vues partielles {>vuePartielle}, concaténé à $views,
    // peut être une chaîne vide ou une chaîne démarrant avec /
    // sera mis à /partials si absent
    partialsPath : '/partials'
  },

  $entities : {
    database : {
      user: "root",
      password: "app",
      database: "app"
    },
  },

  $server : {
    port: 3000,
    // timeout max mis sur toutes les requêtes par node,
    // mettre une valeur supérieure au plus grand timeout utilisé dans l'application
    maxTimeout: 5 * 60 * 1000 + 1000
  },

  memcache : {
    host: '127.0.0.1',
    port: 11211,
    prefix: 'tagazok'
  },

  $rail : {
    // cors : {origin: '*'},
    logger : {format: ':method :url - :post - :referrer', options: {}},
    //compression : {},
    cookie: {key: 'keyboard cat'},
    session: {
      secret: 'keyboard cat',
      saveUninitialized: true,
      resave: true,
      storage: {
        type: 'memcache',
        servers: '127.0.0.1:11211'
      }
    }
  }
}

/**
 * Exemple de composant qui va se placer en dépendance globale
 */
lassi.component('test').config(function($settings) {
  lassi.log("Example", "l'application s'appelle : ", $settings.get('application.name').red);
})
