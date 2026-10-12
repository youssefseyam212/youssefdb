'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const BSON = require('bson');
const { DB, ObjectId, CorruptFileError } = require('../src');
const { makeDb, filesIn, bytes } = require('./helpers');

test('reads collection files written by youssefdb 1.x', (t) => {
  const { dir } = makeDb(t);
  const id = new ObjectId();
  fs.writeFileSync(path.join(dir, 'users.bson'), BSON.serialize({ data: [{ _id: id, name: 'Old', age: 40 }] }));
  const users = new DB({ dir }).collection('users');
  assert.equal(users.findOne({ _id: id }).name, 'Old');
  users.insertOne({ name: 'New' });
  assert.equal(users.countDocuments(), 2);
});

test('ignores the broken index files 1.x tried to write (usersIndex.bson)', (t) => {
  const { dir } = makeDb(t);
  fs.writeFileSync(path.join(dir, 'users.bson'), BSON.serialize({ data: [{ name: 'A' }] }));
  fs.writeFileSync(path.join(dir, 'usersIndex.bson'), BSON.serialize({ data: { name: { A: [] } } }));
  const db = new DB({ dir });
  assert.equal(db.collection('users').find({ name: 'A' }).length, 1);
  assert.deepEqual(db.listCollections(), ['users', 'usersIndex']);
});

test('a corrupt collection file throws CorruptFileError and is never overwritten', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  const file = path.join(dir, 'users.bson');
  const cases = [Buffer.from('not bson at all'), Buffer.alloc(0), BSON.serialize({ wrong: 'shape' }), BSON.serialize({ data: 'x' }), BSON.serialize({ data: [1, 2] }), BSON.serialize({ data: [{ ok: 1 }, 'x'] })];
  for (const content of cases) {
    fs.writeFileSync(file, content);
    for (const op of [() => users.find(), () => users.findOne({}), () => users.countDocuments(), () => users.insertOne({ a: 1 }), () => users.insertMany([{ a: 1 }]), () => users.updateOne({}, { $set: { a: 1 } }), () => users.updateMany({}, { $set: { a: 1 } }), () => users.deleteOne({}), () => users.deleteMany({}), () => users.createIndex('a')]) {
      assert.throws(op, (err) => err instanceof CorruptFileError && err.filePath === file);
    }
    assert.deepEqual(fs.readFileSync(file), content, 'the corrupt file is left exactly as it was');
  }
});

test('writes leave no temporary files behind', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  users.insertMany([{ a: 1 }, { a: 2 }]);
  users.createIndex('a');
  users.updateMany({}, { $set: { b: 1 } });
  users.deleteOne({ a: 1 });
  assert.deepEqual(filesIn(dir), ['users.bson', 'users.index.bson']);
});

test('a failed write leaves the previous file intact and cleans up', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  users.insertOne({ a: 1 });
  const before = bytes(dir, 'users.bson');
  const original = fs.renameSync;
  fs.renameSync = () => {
    throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  };
  t.after(() => {
    fs.renameSync = original;
  });
  assert.throws(() => users.insertOne({ a: 2 }), /disk full/);
  fs.renameSync = original;
  assert.deepEqual(bytes(dir, 'users.bson'), before);
  assert.deepEqual(filesIn(dir), ['users.bson']);
  assert.equal(users.countDocuments(), 1);
});

test('collections are independent files', (t) => {
  const { db, dir } = makeDb(t);
  db.collection('a').insertOne({ x: 1 });
  db.collection('b').insertMany([{ x: 1 }, { x: 2 }]);
  db.collection('a').deleteMany({});
  assert.equal(db.collection('b').countDocuments(), 2);
  assert.deepEqual(filesIn(dir), ['a.bson', 'b.bson']);
});

test('collections larger than bson’s default 17 MB buffer can be written and read', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('big');
  const chunk = 'x'.repeat(1024 * 1024);
  c.insertMany(Array.from({ length: 18 }, (_, i) => ({ i, chunk })));
  c.insertOne({ i: 18, chunk });
  assert.equal(c.countDocuments(), 19);
  assert.equal(c.findOne({ i: 18 }).chunk.length, chunk.length);
});

test('many sequential writes keep every document', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  for (let i = 0; i < 200; i++) c.insertOne({ i });
  assert.equal(c.countDocuments(), 200);
  assert.deepEqual(c.find().map((d) => d.i), Array.from({ length: 200 }, (_, i) => i));
});

test('unexpected file system errors are passed through, not hidden', (t) => {
  const { db, dir } = makeDb(t);
  fs.mkdirSync(path.join(dir, 'users.bson'));
  assert.throws(() => db.collection('users').find(), (err) => err.code === 'EISDIR');
});
