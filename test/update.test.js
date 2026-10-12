'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DB, ValidationError, UnsupportedOperationError } = require('../src');
const { makeDb, seeded, bytes } = require('./helpers');

test('updateOne changes only the first match and returns MongoDB-style counts', (t) => {
  const { users } = seeded(t);
  const res = users.updateOne({ city: 'Giza' }, { $set: { age: 26, verified: true } });
  assert.deepEqual(res, { acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  assert.equal(users.findOne({ name: 'Bob' }).age, 26);
  assert.equal(users.findOne({ name: 'Bob' }).verified, true);
  assert.equal(users.findOne({ name: 'Cara' }).age, 30);
  assert.equal(users.findOne({ name: 'Cara' }).verified, undefined);
});

test('updateMany changes every match', (t) => {
  const { users } = seeded(t);
  const res = users.updateMany({ age: 30 }, { $set: { senior: true } });
  assert.deepEqual(res, { acknowledged: true, matchedCount: 2, modifiedCount: 2 });
  assert.deepEqual(users.find({ senior: true }).map((d) => d.name), ['Alice', 'Cara']);
  assert.equal(users.findOne({ name: 'Bob' }).senior, undefined);
});

test('updateMany with {} updates every document', (t) => {
  const { users } = seeded(t);
  assert.equal(users.updateMany({}, { $set: { v: 1 } }).modifiedCount, 3);
  assert.equal(users.countDocuments({ v: 1 }), 3);
});

test('no match: counts are 0 and the file is not rewritten', (t) => {
  const { users, dir } = seeded(t);
  const before = bytes(dir, 'users.bson');
  assert.deepEqual(users.updateOne({ name: 'Zed' }, { $set: { a: 1 } }), { acknowledged: true, matchedCount: 0, modifiedCount: 0 });
  assert.deepEqual(users.updateMany({ name: 'Zed' }, { $set: { a: 1 } }), { acknowledged: true, matchedCount: 0, modifiedCount: 0 });
  assert.deepEqual(bytes(dir, 'users.bson'), before);
});

test('setting the same value counts as matched but not modified, and skips the write', (t) => {
  const { users, dir } = seeded(t);
  const before = bytes(dir, 'users.bson');
  assert.deepEqual(users.updateOne({ name: 'Alice' }, { $set: { age: 30 } }), { acknowledged: true, matchedCount: 1, modifiedCount: 0 });
  assert.deepEqual(users.updateMany({ age: 30 }, { $set: { age: 30 } }), { acknowledged: true, matchedCount: 2, modifiedCount: 0 });
  assert.deepEqual(users.updateOne({ name: 'Alice' }, { $set: { tags: ['admin', 'dev'] } }).modifiedCount, 0);
  assert.deepEqual(bytes(dir, 'users.bson'), before);
});

test('updateMany counts only documents that really changed', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(users.updateMany({}, { $set: { age: 30 } }), { acknowledged: true, matchedCount: 3, modifiedCount: 1 });
});

test('$set can add fields, set null, and store arrays, objects and dates', (t) => {
  const { users } = seeded(t);
  const when = new Date('2025-01-01T00:00:00Z');
  users.updateOne({ name: 'Alice' }, { $set: { city: null, addr: { zip: '1' }, list: [1, 2], when } });
  const a = users.findOne({ name: 'Alice' });
  assert.equal(a.city, null);
  assert.deepEqual(a.addr, { zip: '1' });
  assert.deepEqual(a.list, [1, 2]);
  assert.equal(a.when.getTime(), when.getTime());
});

test('empty $set is allowed and changes nothing', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(users.updateOne({ name: 'Alice' }, { $set: {} }), { acknowledged: true, matchedCount: 1, modifiedCount: 0 });
});

test('updates persist and are visible to a new DB object', (t) => {
  const { users, dir } = seeded(t);
  users.updateOne({ name: 'Alice' }, { $set: { age: 31 } });
  assert.equal(new DB({ dir }).collection('users').findOne({ name: 'Alice' }).age, 31);
});

test('can find by _id (ObjectId or hex string) and update', (t) => {
  const { users } = seeded(t);
  const bob = users.findOne({ name: 'Bob' });
  assert.equal(users.updateOne({ _id: bob._id }, { $set: { a: 1 } }).modifiedCount, 1);
  assert.equal(users.updateOne({ _id: bob._id.toHexString() }, { $set: { a: 2 } }).modifiedCount, 1);
  assert.equal(users.findOne({ name: 'Bob' }).a, 2);
});

test('_id cannot change; setting it to the same value is fine', (t) => {
  const { users, dir } = seeded(t);
  const before = bytes(dir, 'users.bson');
  const alice = users.findOne({ name: 'Alice' });
  assert.throws(() => users.updateOne({ name: 'Alice' }, { $set: { _id: 'new' } }), ValidationError);
  assert.throws(() => users.updateMany({}, { $set: { _id: 'same-for-all', x: 1 } }), ValidationError);
  assert.deepEqual(bytes(dir, 'users.bson'), before, 'a failed updateMany saves nothing');
  assert.equal(users.updateOne({ name: 'Alice' }, { $set: { _id: alice._id, x: 1 } }).modifiedCount, 1);
});

test('invalid updates throw ValidationError before touching the file', (t) => {
  const { users, dir } = seeded(t);
  const before = bytes(dir, 'users.bson');
  const bad = [undefined, null, 'x', [], {}, { age: 31 }, { $set: null }, { $set: 'x' }, { $set: [] }, { $set: { a: undefined } }, { $set: { a: () => 1 } }, { $set: { '': 1 } }, { $set: { a: 1n } }, { $set: JSON.parse('{"__proto__": 1}') }];
  bad.forEach((update, i) => {
    assert.throws(() => users.updateOne({ name: 'Alice' }, update), ValidationError, `bad update #${i}`);
    assert.throws(() => users.updateMany({}, update), ValidationError, `bad update #${i}`);
  });
  assert.deepEqual(bytes(dir, 'users.bson'), before);
});

test('regression: updateMany without $set throws a clear error instead of a TypeError', (t) => {
  const { users } = seeded(t);
  assert.throws(() => users.updateMany({ age: 30 }, { name: 'x' }), (err) => err instanceof ValidationError && /\$set/.test(err.message));
});

test('unsupported operators and paths throw UnsupportedOperationError', (t) => {
  const { users } = seeded(t);
  for (const update of [{ $inc: { age: 1 } }, { $unset: { a: '' } }, { $push: { tags: 'x' } }, { $set: { a: 1 }, $inc: { b: 1 } }, { $set: { 'addr.city': 'x' } }, { $set: { $bad: 1 } }]) {
    assert.throws(() => users.updateOne({}, update), UnsupportedOperationError, JSON.stringify(update));
  }
});

test('filters are required and validated', (t) => {
  const { users } = seeded(t);
  for (const method of ['updateOne', 'updateMany']) {
    assert.throws(() => users[method](undefined, { $set: { a: 1 } }), ValidationError);
    assert.throws(() => users[method](null, { $set: { a: 1 } }), ValidationError);
    assert.throws(() => users[method]('Alice', { $set: { a: 1 } }), ValidationError);
    assert.throws(() => users[method]({ age: { $gt: 1 } }, { $set: { a: 1 } }), UnsupportedOperationError);
  }
});

test('updating an empty or missing collection is a no-op', (t) => {
  const { db } = makeDb(t);
  assert.deepEqual(db.collection('none').updateOne({}, { $set: { a: 1 } }), { acknowledged: true, matchedCount: 0, modifiedCount: 0 });
  assert.deepEqual(db.collection('none').updateMany({}, { $set: { a: 1 } }), { acknowledged: true, matchedCount: 0, modifiedCount: 0 });
});

test('caller’s update object is not stored by reference', (t) => {
  const { users } = seeded(t);
  const addr = { city: 'X' };
  users.updateOne({ name: 'Alice' }, { $set: { addr } });
  addr.city = 'changed later';
  assert.equal(users.findOne({ name: 'Alice' }).addr.city, 'X');
});
