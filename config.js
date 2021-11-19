const DB_HOST = '127.0.0.1'
const DB_PORT = '27017'
const DB_NAME = 'free'

module.exports = {
    forceDate: false,
    default: {
        host: DB_HOST,
        port: DB_PORT,
        name: DB_NAME
    },
    production: {
        host: DB_HOST,
        port: DB_PORT,
        name: DB_NAME + '_db_prod'
    },
    development: {
        host: DB_HOST,
        port: DB_PORT,
        name: DB_NAME + '_db_dev1'
    },
    test: {
        host: DB_HOST,
        port: DB_PORT,
        name: DB_NAME + '_db_test'
    },
    sit: {
        host: DB_HOST,
        port: DB_PORT,
        name: DB_NAME + '_db_sit'
    },
    dependencies: []
}
