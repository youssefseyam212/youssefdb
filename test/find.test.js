'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, ValidationError, UnsupportedOperationError } = require('../src');
const { makeDb, seeded, filesIn } = require('./helpers');

const names = (docs) => docs.map((d) => d.name);

test('empty or missing collection returns [] and creates no file', (t) => {
  const { db, dir } = makeDb(t);
  assert.deepEqual(db.collection('nothing').find(), []);
  assert.deepEqual(db.collection('nothing').find({ a: 1 }), []);
  assert.deepEqual(filesIn(dir), []);
});

test('no query, {} , undefined and null all return every document in insertion order', (t) => {
  const { users } = seeded(t);
  for (const q of [undefined, null, {}]) assert.deepEqual(names(users.find(q)), ['Alice', 'Bob', 'Cara']);
});

test('exact match on one field', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(names(users.find({ city: 'Giza' })), ['Bob', 'Cara']);
  assert.deepEqual(names(users.find({ age: 30 })), ['Alice', 'Cara']);
  assert.deepEqual(users.find({ city: 'Alexandria' }), []);
});

test('several fields must all match (AND)', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(names(users.find({ age: 30, city: 'Giza' })), ['Cara']);
  assert.deepEqual(users.find({ age: 25, city: 'Cairo' }), []);
});

test('type-strict: no coercion between strings, numbers and booleans', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.insertMany([{ v: 1 }, { v: '1' }, { v: true }, { v: 0 }, { v: '' }, { v: false }, { v: null }, {}]);
  assert.equal(c.find({ v: 1 }).length, 1);
  assert.equal(c.find({ v: '1' }).length, 1);
  assert.equal(c.find({ v: true }).length, 1);
  assert.equal(c.find({ v: 0 }).length, 1);
  assert.equal(c.find({ v: '' }).length, 1);
  assert.equal(c.find({ v: false }).length, 1);
});

test('strings are case-sensitive and match whole values only', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(users.find({ name: 'alice' }), []);
  assert.deepEqual(users.find({ name: 'Ali' }), []);
});

test('null (or undefined) matches fields that are null or missing', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.insertMany([{ n: 1, v: null }, { n: 2 }, { n: 3, v: 0 }, { n: 4, v: [] }, { n: 5, v: [null] }]);
  assert.deepEqual(c.find({ v: null }).map((d) => d.n), [1, 2]);
  assert.deepEqual(c.find({ v: undefined }).map((d) => d.n), [1, 2]);
});

test('arrays: a single value matches any element; an array matches the whole array exactly', (t) => {
  const { users } = seeded(t);
  assert.deepEqual(names(users.find({ tags: 'dev' })), ['Alice', 'Bob']);
  assert.deepEqual(names(users.find({ tags: 'admin' })), ['Alice']);
  assert.deepEqual(names(users.find({ tags: ['dev'] })), ['Bob']);
  assert.deepEqual(names(users.find({ tags: ['admin', 'dev'] })), ['Alice']);
  assert.deepEqual(users.find({ tags: ['dev', 'admin'] }), [], 'order matters');
  assert.deepEqual(users.find({ tags: [] }), []);
});

test('embedded documents match by value, ignoring key order', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.insertMany([{ n: 1, addr: { city: 'Cairo', zip: '11511' } }, { n: 2, addr: { city: 'Cairo' } }]);
  assert.deepEqual(c.find({ addr: { zip: '11511', city: 'Cairo' } }).map((d) => d.n), [1]);
  assert.deepEqual(c.find({ addr: { city: 'Cairo' } }).map((d) => d.n), [2], 'no partial match');
});

test('_id queries work with ObjectId, its hex string (any case) and custom ids', (t) => {
  const { users } = seeded(t);
  const alice = users.findOne({ name: 'Alice' });
  const hex = alice._id.toHexString();
  assert.deepEqual(names(users.find({ _id: alice._id })), ['Alice']);
  assert.deepEqual(names(users.find({ _id: new ObjectId(hex) })), ['Alice']);
  assert.deepEqual(names(users.find({ _id: hex })), ['Alice']);
  assert.deepEqual(names(users.find({ _id: hex.toUpperCase() })), ['Alice']);
  assert.deepEqual(users.find({ _id: new ObjectId() }), []);
  assert.deepEqual(users.find({ _id: 'not-an-id' }), []);
});

test('Dates match by time', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.insertOne({ at: new Date('2024-05-01T00:00:00Z') });
  assert.equal(c.find({ at: new Date('2024-05-01T00:00:00Z') }).length, 1);
  assert.equal(c.find({ at: new Date('2024-05-02T00:00:00Z') }).length, 0);
  assert.equal(c.find({ at: '2024-05-01T00:00:00.000Z' }).length, 0, 'a string is not a Date');
});

test('NaN matches NaN; 0 matches -0', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.insertMany([{ v: NaN }, { v: -0 }]);
  assert.equal(c.find({ v: NaN }).length, 1);
  assert.equal(c.find({ v: 0 }).length, 1);
});

test('results are copies: changing them does not change the database', (t) => {
  const { users } = seeded(t);
  const [alice] = users.find({ name: 'Alice' });
  alice.age = 99;
  alice.tags.push('hacked');
  const again = users.findOne({ name: 'Alice' });
  assert.equal(again.age, 30);
  assert.deepEqual(again.tags, ['admin', 'dev']);
});

test('regression: operators throw a clear UnsupportedOperationError instead of returning wrong results', (t) => {
  const { users } = seeded(t);
  for (const q of [{ age: { $gt: 25 } }, { age: { $in: [25, 30] } }, { $or: [{ a: 1 }] }, { $and: [] }, { name: { $regex: 'A' } }, { 'addr.city': 'Cairo' }, { name: /Ali/ }]) {
    assert.throws(() => users.find(q), UnsupportedOperationError, JSON.stringify(q));
  }
});

test('invalid queries throw ValidationError, even on an empty collection', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('empty');
  for (const q of ['name', 5, true, [], [{ a: 1 }], new Date(), new ObjectId(), { '': 1 }, { fn: () => 1 }, { n: 1n }]) {
    assert.throws(() => c.find(q), ValidationError, String(q));
  }
});

test('field names that look like methods or prototype keys are ordinary fields', (t) => {
  const { db } = makeDb(t);
  const c = db.collection('c');
  c.insertMany([{ constructor: 'x', toString: 'y', hasOwnProperty: 1 }, { other: 1 }]);
  assert.equal(c.find({ constructor: 'x' }).length, 1);
  assert.equal(c.find({ toString: 'y' }).length, 1);
  assert.equal(c.find({ hasOwnProperty: 1 }).length, 1);
  assert.equal(c.find({ constructor: null }).length, 1, 'missing own field, not the prototype’s');
  assert.throws(() => c.find(JSON.parse('{"__proto__": 1}')), ValidationError);
});

test('findOne returns the first match or null (never undefined)', (t) => {
  const { users } = seeded(t);
  assert.equal(users.findOne({ city: 'Giza' }).name, 'Bob');
  assert.equal(users.findOne().name, 'Alice');
  assert.equal(users.findOne({ city: 'Nowhere' }), null);
  assert.equal(users.findOne({ age: '30' }), null, 'regression: no loose == matching');
  assert.throws(() => users.findOne({ age: { $gt: 1 } }), UnsupportedOperationError);
  assert.throws(() => users.findOne('Alice'), ValidationError);
});

test('countDocuments', (t) => {
  const { users, db } = seeded(t);
  assert.equal(users.countDocuments(), 3);
  assert.equal(users.countDocuments({ age: 30 }), 2);
  assert.equal(users.countDocuments({ age: 99 }), 0);
  assert.equal(db.collection('none').countDocuments(), 0);
  assert.throws(() => users.countDocuments(7), ValidationError);
});
