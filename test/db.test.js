'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const youssefdb = require('../src');
const { DB, makeDb } = require('./helpers');

test('exports: default export is DB, with named exports for everything public', () => {
  assert.equal(typeof youssefdb, 'function');
  assert.equal(youssefdb.DB, youssefdb);
  for (const name of ['ObjectId', 'Collection', 'YoussefDBError', 'ValidationError', 'UnsupportedOperationError', 'DuplicateKeyError', 'CorruptFileError', 'IndexNotFoundError']) {
    assert.ok(youssefdb[name], `missing export ${name}`);
  }
  assert.equal(require('../DB.js'), youssefdb, 'DB.js shim from 1.x points at the same module');
});

test('default folder is ./data under the current working directory', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'youssefdb-cwd-'));
  const prev = process.cwd();
  process.chdir(tmp);
  t.after(() => {
    process.chdir(prev);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const db = new DB();
  assert.equal(db.dir, path.join(fs.realpathSync(tmp), 'data'));
  db.collection('users').insertOne({ a: 1 });
  assert.ok(fs.existsSync(path.join(tmp, 'data', 'users.bson')));
});

test('dir option: relative paths are resolved, the folder is created on first write only', (t) => {
  const { dir } = makeDb(t);
  const nested = path.join(dir, 'a', 'b');
  const db = new DB({ dir: nested });
  assert.equal(fs.existsSync(nested), false, 'creating a DB or a collection writes nothing');
  db.collection('x');
  assert.equal(fs.existsSync(nested), false);
  db.collection('x').insertOne({ v: 1 });
  assert.ok(fs.existsSync(path.join(nested, 'x.bson')));
});

test('invalid options throw ValidationError', () => {
  for (const bad of [null, 'data', 42, [], new Map()]) {
    assert.throws(() => new DB(bad), youssefdb.ValidationError, `options ${String(bad)}`);
  }
  for (const dir of ['', 5, null, {}]) {
    assert.throws(() => new DB({ dir }), youssefdb.ValidationError, `dir ${String(dir)}`);
  }
});

test('collection names: valid names work, unsafe or odd names throw', (t) => {
  const { db } = makeDb(t);
  for (const ok of ['users', 'Users_2', 'order-items', 'a', 'x'.repeat(64), 'collection', 'collections', 'constructor', '__proto__x']) {
    assert.doesNotThrow(() => db.collection(ok), ok);
  }
  for (const bad of ['', ' ', 'x'.repeat(65), '../etc', 'a/b', 'a\\b', 'a.b', 'users.index', 'café', null, undefined, 3, {}, ['users']]) {
    assert.throws(() => db.collection(bad), youssefdb.ValidationError, `name ${JSON.stringify(bad)}`);
  }
});

test('regression: a collection named "collection" no longer breaks the database', (t) => {
  const { db } = makeDb(t);
  db.collection('collection').insertOne({ x: 1 });
  db.collection('other').insertOne({ y: 2 });
  assert.equal(db.collection('collection').countDocuments(), 1);
  assert.equal(typeof db.collection, 'function');
});

test('collection() returns the same object for the same name', (t) => {
  const { db } = makeDb(t);
  assert.equal(db.collection('users'), db.collection('users'));
  assert.notEqual(db.collection('users'), db.collection('Users'));
});

test('listCollections lists collection files only, sorted', (t) => {
  const { db, dir } = makeDb(t);
  assert.deepEqual(new DB({ dir: path.join(dir, 'missing') }).listCollections(), []);
  db.collection('zeta').insertOne({});
  db.collection('alpha').insertOne({});
  db.collection('alpha').createIndex('x');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'hi');
  assert.deepEqual(db.listCollections(), ['alpha', 'zeta']);
});

test('two DB objects on the same folder see each other’s writes', (t) => {
  const { db, dir } = makeDb(t);
  db.collection('users').insertOne({ name: 'A' });
  const other = new DB({ dir });
  assert.equal(other.collection('users').countDocuments(), 1);
  other.collection('users').insertOne({ name: 'B' });
  assert.equal(db.collection('users').countDocuments(), 2);
});
