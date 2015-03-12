// Configuration de la base de données
module.exports = {
  application : {
    name: 'Bang Lassi',
    staging: 'dev',
    mail: 'toto'
  },

  $entities : {
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

  $server : {
    port: 3000
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
