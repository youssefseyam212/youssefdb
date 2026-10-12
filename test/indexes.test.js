'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const BSON = require('bson');
const { DB, ObjectId, ValidationError, UnsupportedOperationError, IndexNotFoundError } = require('../src');
const { makeDb, seeded, readRaw } = require('./helpers');

const names = (docs) => docs.map((d) => d.name);

test('createIndex returns the index name and writes <name>.index.bson', (t) => {
  const { users, dir } = seeded(t);
  assert.equal(users.createIndex('city'), 'city_1');
  assert.equal(users.createIndex({ age: 1 }), 'age_1');
  assert.equal(users.createIndex({ name: -1 }), 'name_1');
  assert.ok(fs.existsSync(path.join(dir, 'users.index.bson')));
  assert.deepEqual(users.listIndexes(), [
    { name: 'city_1', field: 'city' },
    { name: 'age_1', field: 'age' },
    { name: 'name_1', field: 'name' },
  ]);
});

test('creating the same index twice does nothing', (t) => {
  const { users } = seeded(t);
  users.createIndex('city');
  users.createIndex({ city: 1 });
  assert.equal(users.listIndexes().length, 1);
});

test('regression: 1.x style createIndex({ city: "Giza" }) works and indexes the whole field', (t) => {
  const { users } = seeded(t);
  assert.equal(users.createIndex({ city: 'Giza' }), 'city_1');
  assert.deepEqual(names(users.find({ city: 'Giza' })), ['Bob', 'Cara']);
  assert.deepEqual(names(users.find({ city: 'Cairo' })), ['Alice']);
});

test('regression: find with an index returns the same documents as without one', (t) => {
  const { users } = seeded(t);
  const queries = [{ city: 'Giza' }, { age: 30 }, { tags: 'dev' }, { city: 'Nowhere' }, { age: 30, city: 'Giza' }, { missing: null }];
  const before = queries.map((q) => users.find(q));
  users.createIndex('city');
  users.createIndex('age');
  users.createIndex('tags');
  users.createIndex('missing');
  queries.forEach((q, i) => assert.deepEqual(users.find(q), before[i], JSON.stringify(q)));
});

test('the index stays correct after inserts, updates and deletes', (t) => {
  const { users } = seeded(t);
  users.createIndex('city');
  users.insertOne({ name: 'Dina', city: 'Giza' });
  assert.deepEqual(names(users.find({ city: 'Giza' })), ['Bob', 'Cara', 'Dina']);
  users.updateOne({ name: 'Bob' }, { $set: { city: 'Cairo' } });
  assert.deepEqual(names(users.find({ city: 'Giza' })), ['Cara', 'Dina']);
  assert.deepEqual(names(users.find({ city: 'Cairo' })), ['Alice', 'Bob']);
  users.deleteOne({ name: 'Alice' });
  assert.deepEqual(names(users.find({ city: 'Cairo' })), ['Bob']);
  users.deleteMany({});
  assert.deepEqual(users.find({ city: 'Cairo' }), []);
  users.insertMany([{ name: 'E', city: 'Cairo' }]);
  assert.deepEqual(names(users.find({ city: 'Cairo' })), ['E']);
});

test('an index created on an empty collection works once documents arrive', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.createIndex('k');
  c.insertMany([{ k: 1 }, { k: 2 }, { k: 1 }]);
  assert.equal(c.find({ k: 1 }).length, 2);
});

test('index lookups are type-strict, case-sensitive and handle null, missing and arrays', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.createIndex('v');
  c.insertMany([{ n: 1, v: 1 }, { n: 2, v: '1' }, { n: 3, v: null }, { n: 4 }, { n: 5, v: [1, 'a'] }, { n: 6, v: 'A' }, { n: 7, v: true }, { n: 8, v: new Date(5) }, { n: 9, v: [null] }]);
  const ns = (q) => c.find(q).map((d) => d.n);
  assert.deepEqual(ns({ v: 1 }), [1, 5]);
  assert.deepEqual(ns({ v: '1' }), [2]);
  assert.deepEqual(ns({ v: 'a' }), [5]);
  assert.deepEqual(ns({ v: 'A' }), [6]);
  assert.deepEqual(ns({ v: true }), [7]);
  assert.deepEqual(ns({ v: null }), [3, 4]);
  assert.deepEqual(ns({ v: new Date(5) }), [8]);
  assert.deepEqual(ns({ v: [1, 'a'] }), [5], 'whole-array queries fall back to a scan');
});

test('an _id index finds by ObjectId and by hex string', (t) => {
  const { users } = seeded(t);
  users.createIndex('_id');
  const bob = users.findOne({ name: 'Bob' });
  assert.deepEqual(names(users.find({ _id: bob._id })), ['Bob']);
  assert.deepEqual(names(users.find({ _id: bob._id.toHexString() })), ['Bob']);
  assert.deepEqual(users.find({ _id: new ObjectId() }), []);
});

test('the index is rebuilt if the collection file was changed outside youssefdb', (t) => {
  const { users, dir } = seeded(t);
  users.createIndex('city');
  const file = path.join(dir, 'users.bson');
  const raw = readRaw(dir, 'users.bson');
  raw.data.push({ _id: new ObjectId(), name: 'Outsider', city: 'Giza' });
  raw.data[0].city = 'Giza';
  fs.writeFileSync(file, BSON.serialize(raw));
  assert.deepEqual(names(users.find({ city: 'Giza' })), ['Alice', 'Bob', 'Cara', 'Outsider']);
});

test('a corrupt or hand-edited index file never breaks reads or writes', (t) => {
  const { users, dir } = seeded(t);
  users.createIndex('city');
  const indexFile = path.join(dir, 'users.index.bson');
  for (const content of [Buffer.from('garbage'), Buffer.alloc(0), BSON.serialize({ version: 99 }), BSON.serialize({ version: 1, sourceHash: 'x', fields: ['city'], entries: [{ field: 'city', keys: [['s"Giza"', [-1]]] }] })]) {
    fs.writeFileSync(indexFile, content);
    assert.deepEqual(names(users.find({ city: 'Giza' })), ['Bob', 'Cara']);
    assert.doesNotThrow(() => users.updateOne({ name: 'Alice' }, { $set: { touched: Math.random() } }));
  }
});

test('an index file whose hash matches but positions are out of range cannot crash find', (t) => {
  const { users, dir } = seeded(t);
  users.createIndex('city');
  const state = readRaw(dir, 'users.index.bson');
  state.entries[0].keys = [['s"Giza"', [0, 1, 2, 50]]];
  fs.writeFileSync(path.join(dir, 'users.index.bson'), BSON.serialize(state));
  assert.deepEqual(names(users.find({ city: 'Giza' })), ['Bob', 'Cara'], 'candidates are always re-checked');
});

test('dropIndex by field or by name; unknown index throws IndexNotFoundError', (t) => {
  const { users, dir } = seeded(t);
  users.createIndex('city');
  users.createIndex('age');
  assert.equal(users.dropIndex('city_1'), true);
  assert.deepEqual(users.listIndexes(), [{ name: 'age_1', field: 'age' }]);
  assert.deepEqual(names(users.find({ age: 30 })), ['Alice', 'Cara']);
  assert.equal(users.dropIndex('age'), true);
  assert.deepEqual(users.listIndexes(), []);
  assert.equal(fs.existsSync(path.join(dir, 'users.index.bson')), false, 'the last index removes the file');
  assert.throws(() => users.dropIndex('age'), IndexNotFoundError);
  assert.throws(() => users.dropIndex('nothing_1'), IndexNotFoundError);
});

test('a field literally named "x_1" can be indexed and dropped', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.createIndex('x_1');
  c.createIndex('x');
  assert.equal(c.dropIndex('x_1'), true);
  assert.deepEqual(c.listIndexes(), [{ name: 'x_1', field: 'x' }]);
});

test('invalid index specs throw', (t) => {
  const { users } = seeded(t);
  for (const bad of [undefined, null, 5, [], ['city'], {}, { a: 1, b: 1 }, '']) {
    assert.throws(() => users.createIndex(bad), ValidationError, String(bad));
  }
  assert.throws(() => users.createIndex('$where'), UnsupportedOperationError);
  assert.throws(() => users.createIndex('addr.city'), UnsupportedOperationError);
  assert.throws(() => users.createIndex('__proto__'), ValidationError);
  for (const bad of [undefined, '', 5, {}]) assert.throws(() => users.dropIndex(bad), ValidationError);
});

test('listIndexes on a collection with no indexes', (t) => {
  const { db } = makeDb(t);
  assert.deepEqual(db.collection('c').listIndexes(), []);
});

test('indexes survive reopening the database', (t) => {
  const { users, dir } = seeded(t);
  users.createIndex('city');
  const again = new DB({ dir }).collection('users');
  assert.deepEqual(again.listIndexes(), [{ name: 'city_1', field: 'city' }]);
  assert.deepEqual(names(again.find({ city: 'Giza' })), ['Bob', 'Cara']);
});

test('writes keep the index file in step with the collection file (no rebuild needed on read)', (t) => {
  const crypto = require('crypto');
  const { users, dir } = seeded(t);
  users.createIndex('city');
  const sha1 = () => crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, 'users.bson'))).digest('hex');
  for (const write of [() => users.insertOne({ city: 'X' }), () => users.updateMany({}, { $set: { v: 1 } }), () => users.deleteOne({ city: 'X' })]) {
    write();
    assert.equal(readRaw(dir, 'users.index.bson').sourceHash, sha1());
  }
});
