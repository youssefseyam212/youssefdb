'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const BSON = require('bson');
const DB = require('../src');

/** A database in a fresh temporary folder, removed after the test. */
function makeDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youssefdb-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { db: new DB({ dir }), dir };
}

/** A collection seeded with three people. */
function seeded(t) {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  users.insertMany([
    { name: 'Alice', age: 30, city: 'Cairo', tags: ['admin', 'dev'] },
    { name: 'Bob', age: 25, city: 'Giza', tags: ['dev'] },
    { name: 'Cara', age: 30, city: 'Giza' },
  ]);
  return { db, dir, users };
}

const readRaw = (dir, file) => BSON.deserialize(fs.readFileSync(path.join(dir, file)), { promoteBuffers: true });
const filesIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const bytes = (dir, file) => fs.readFileSync(path.join(dir, file));

module.exports = { DB, makeDb, seeded, readRaw, filesIn, bytes };
