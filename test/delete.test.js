'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError, UnsupportedOperationError } = require('../src');
const { makeDb, seeded, bytes } = require('./helpers');

const names = (c) => c.find().map((d) => d.name);

test('deleteOne removes only the first match', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(users.deleteOne({ city: 'Giza' }), { acknowledged: true, deletedCount: 1 });
  assert.deepEqual(names(users), ['Alice', 'Cara']);
});

test('deleteOne with no match returns acknowledged: true, deletedCount: 0 and writes nothing', (t) => {
  const { users, dir } = seeded(t);
  const before = bytes(dir, 'users.bson');
  assert.deepEqual(users.deleteOne({ name: 'Nobody' }), { acknowledged: true, deletedCount: 0 });
  assert.deepEqual(bytes(dir, 'users.bson'), before);
});

test('deleteMany removes every match', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(users.deleteMany({ age: 30 }), { acknowledged: true, deletedCount: 2 });
  assert.deepEqual(names(users), ['Bob']);
});

test('regression: deleteMany with several fields deletes only documents matching ALL of them', (t) => {
  const { users } = seeded(t);
  assert.equal(users.deleteMany({ name: 'Alice', city: 'Giza' }).deletedCount, 0);
  assert.deepEqual(names(users), ['Alice', 'Bob', 'Cara']);
  assert.equal(users.deleteMany({ age: 30, city: 'Giza' }).deletedCount, 1);
  assert.deepEqual(names(users), ['Alice', 'Bob']);
});

test('regression: deleteMany({}) deletes every document', (t) => {
  const { users, dir } = seeded(t);
  assert.equal(users.deleteMany({}).deletedCount, 3);
  assert.deepEqual(users.find(), []);
  assert.ok(bytes(dir, 'users.bson').length > 0, 'the file stays, holding an empty collection');
});

test('deleteOne({}) deletes the first document', (t) => {
  const { users } = seeded(t);
  users.deleteOne({});
  assert.deepEqual(names(users), ['Bob', 'Cara']);
});

test('delete by _id, ObjectId or hex string', (t) => {
  const { users } = seeded(t);
  const bob = users.findOne({ name: 'Bob' });
  assert.equal(users.deleteOne({ _id: bob._id.toHexString() }).deletedCount, 1);
  assert.equal(users.deleteOne({ _id: bob._id }).deletedCount, 0);
});

test('delete with an array value in the filter', (t) => {
  const { users } = seeded(t);
  assert.equal(users.deleteMany({ tags: 'dev' }).deletedCount, 2);
  assert.deepEqual(names(users), ['Cara']);
});

test('filters are required: calling with nothing throws instead of deleting everything', (t) => {
  const { users } = seeded(t);
  for (const method of ['deleteOne', 'deleteMany']) {
    assert.throws(() => users[method](), (err) => err instanceof ValidationError && /Pass \{\}/.test(err.message));
    assert.throws(() => users[method](null), ValidationError);
    assert.throws(() => users[method]('Alice'), ValidationError);
    assert.throws(() => users[method]([]), ValidationError);
    assert.throws(() => users[method]({ age: { $lt: 40 } }), UnsupportedOperationError);
  }
  assert.equal(users.countDocuments(), 3);
});

test('deleting from an empty or missing collection is a no-op', (t) => {
  const { db } = makeDb(t);
  assert.deepEqual(db.collection('none').deleteOne({}), { acknowledged: true, deletedCount: 0 });
  assert.deepEqual(db.collection('none').deleteMany({}), { acknowledged: true, deletedCount: 0 });
});

test('drop removes the collection files; dropping again returns false', (t) => {
  const { users, dir } = seeded(t);
  users.createIndex('city');
  const fs = require('fs');
  assert.equal(users.drop(), true);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(users.drop(), false);
  assert.deepEqual(users.find(), []);
  users.insertOne({ name: 'New' });
  assert.equal(users.countDocuments(), 1, 'the collection can be used again after drop');
  assert.deepEqual(users.listIndexes(), [], 'indexes are dropped with the collection');
});
