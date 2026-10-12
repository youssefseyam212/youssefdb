'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, ValidationError, DuplicateKeyError } = require('../src');
const { makeDb, filesIn, bytes } = require('./helpers');

test('inserts all documents in order and returns their ids by position', (t) => {
  const { db } = makeDb(t);
  const users = db.collection('users');
  const res = users.insertMany([{ n: 1 }, { n: 2, _id: 'two' }, { n: 3 }]);
  assert.equal(res.acknowledged, true);
  assert.equal(res.insertedCount, 3);
  assert.deepEqual(Object.keys(res.insertedIds), ['0', '1', '2']);
  assert.ok(res.insertedIds[0] instanceof ObjectId);
  assert.equal(res.insertedIds[1], 'two');
  assert.deepEqual(users.find().map((d) => d.n), [1, 2, 3]);
});

test('appends after existing documents', (t) => {
  const { db } = makeDb(t);
  const users = db.collection('users');
  users.insertOne({ n: 0 });
  users.insertMany([{ n: 1 }, { n: 2 }]);
  assert.deepEqual(users.find().map((d) => d.n), [0, 1, 2]);
});

test('an empty array inserts nothing and writes nothing', (t) => {
  const { db, dir } = makeDb(t);
  assert.deepEqual(db.collection('users').insertMany([]), { acknowledged: true, insertedCount: 0, insertedIds: {} });
  assert.deepEqual(filesIn(dir), []);
});

test('non-arrays throw ValidationError', (t) => {
  const { db } = makeDb(t);
  for (const bad of [undefined, null, {}, { 0: { a: 1 }, length: 1 }, 'abc', 5]) {
    assert.throws(() => db.collection('users').insertMany(bad), ValidationError);
  }
});

test('all or nothing: one invalid document means none is inserted', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  users.insertOne({ n: 0 });
  const before = bytes(dir, 'users.bson');
  assert.throws(
    () => users.insertMany([{ n: 1 }, { n: 2, fn: () => {} }, { n: 3 }]),
    (err) => err instanceof ValidationError && /index 1/.test(err.message)
  );
  assert.throws(() => users.insertMany([{ n: 1 }, null]), ValidationError);
  assert.deepEqual(bytes(dir, 'users.bson'), before);
});

test('all or nothing: duplicate _id within the batch or with existing documents', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  users.insertOne({ _id: 'a' });
  const before = bytes(dir, 'users.bson');
  assert.throws(() => users.insertMany([{ _id: 'b' }, { _id: 'b' }]), DuplicateKeyError);
  assert.throws(() => users.insertMany([{ _id: 'c' }, { _id: 'a' }]), DuplicateKeyError);
  assert.deepEqual(bytes(dir, 'users.bson'), before);
  assert.equal(users.countDocuments(), 1);
});

test('does not modify the caller’s documents', (t) => {
  const { db } = makeDb(t);
  const input = [{ a: 1 }, { b: 2 }];
  db.collection('u').insertMany(input);
  assert.deepEqual(input, [{ a: 1 }, { b: 2 }]);
});

test('the same object twice in one batch gets two different ids', (t) => {
  const { db } = makeDb(t);
  const doc = { a: 1 };
  const res = db.collection('u').insertMany([doc, doc]);
  assert.notEqual(res.insertedIds[0].toHexString(), res.insertedIds[1].toHexString());
});
