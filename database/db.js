const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db = null;

// Create database connection as a promise
function connect() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = new sqlite3.Database(path.join(__dirname, 'eventbooking.db'), (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
        reject(err);
      } else {
        console.log('Connected to the SQLite database.');
        resolve(db);
      }
    });
  });
}

// Close database connection
function close() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        reject(err);
      } else {
        console.log('Database connection closed.');
        db = null;
        resolve();
      }
    });
  });
}

// Wrap db.run in a promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database connection not established'));
      return;
    }
    
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Error running sql ' + sql);
        console.error(err);
        reject(err);
      } else {
        resolve({ id: this.lastID });
      }
    });
  });
}

// Wrap db.get in a promise
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database connection not established'));
      return;
    }

    db.get(sql, params, (err, result) => {
      if (err) {
        console.error('Error running sql: ' + sql);
        console.error(err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

// Wrap db.all in a promise
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database connection not established'));
      return;
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error running sql: ' + sql);
        console.error(err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  connect,
  close,
  run,
  get,
  all
};