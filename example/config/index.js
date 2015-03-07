// Configuration de la base de données
module.exports = {
  application : {
    name: 'Bang Lassi',
    mail: 'dev.lassi@arnumeral.fr',
    staging: 'dev'
  },
  entities : {
    database : {
      client: "mysql",
      connection: {
        host: 'localhost',
        user: "root",
        password: "app",
        database: "app"
      }
    },
  },

  renderer : {
    cache : true
  },

  server : {
    port: 8000
  },

  rail : {
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
    },
    authentication: {},
  },

  // Configuration des plugins
  components : {
    // Plugin "main"
    main : {
      // Titre de l'application. Voir dans index.js du plugin.
      title: 'Bang Lassi'
    }
  }
}
