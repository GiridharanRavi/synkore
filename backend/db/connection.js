const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'fabricflow',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,   // ✅ return DATE/DATETIME/TIMESTAMP columns as plain
                        //    'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' strings,
                        //    skipping the JS Date object entirely so no
                        //    timezone conversion can happen on the way in
                        //    or out.
});

// ✅ Test connection on startup
pool.getConnection()
  .then(conn => { console.log('✅ MySQL connected'); conn.release(); })
  .catch(err => { console.error('❌ MySQL failed:', err.message); });

module.exports = pool;

// backend/db/connection.js