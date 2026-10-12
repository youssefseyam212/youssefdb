'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, ValidationError, DuplicateKeyError } = require('../src');
const { makeDb, readRaw, filesIn } = require('./helpers');

test('inserts a document, generates an ObjectId and saves { data: [...] }', (t) => {
  const { db, dir } = makeDb(t);
  const res = db.collection('users').insertOne({ name: 'Alice', age: 30 });
  assert.equal(res.acknowledged, true);
  assert.ok(res.insertedId instanceof ObjectId);
  const raw = readRaw(dir, 'users.bson');
  assert.equal(raw.data.length, 1);
  assert.equal(raw.data[0].name, 'Alice');
  assert.equal(raw.data[0]._id.toHexString(), res.insertedId.toHexString());
  assert.deepEqual(Object.keys(raw.data[0]), ['_id', 'name', 'age'], '_id is stored first');
});

test('does not modify the caller’s object', (t) => {
  const { db } = makeDb(t);
  const doc = { name: 'Alice' };
  db.collection('users').insertOne(doc);
  assert.deepEqual(doc, { name: 'Alice' });
});

test('keeps a caller-supplied _id of any storable type', (t) => {
  const { db } = makeDb(t);
  const users = db.collection('users');
  const oid = new ObjectId();
  for (const _id of ['custom-id', 42, oid, { region: 'eg', n: 1 }, new Date(0), false]) {
    const res = users.insertOne({ _id, v: 1 });
    assert.deepEqual(res.insertedId, _id);
  }
  assert.equal(users.findOne({ _id: 'custom-id' }).v, 1);
  assert.equal(users.findOne({ _id: 42 }).v, 1);
  assert.equal(users.findOne({ _id: oid }).v, 1);
  assert.equal(users.countDocuments(), 6);
});

test('_id: undefined is treated as missing and generated', (t) => {
  const { db } = makeDb(t);
  const res = db.collection('users').insertOne({ _id: undefined, a: 1 });
  assert.ok(res.insertedId instanceof ObjectId);
});

test('duplicate _id throws DuplicateKeyError and writes nothing', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  users.insertOne({ _id: 'a', v: 1 });
  const before = readRaw(dir, 'users.bson');
  assert.throws(() => users.insertOne({ _id: 'a', v: 2 }), DuplicateKeyError);
  const oid = new ObjectId();
  users.insertOne({ _id: oid });
  assert.throws(() => users.insertOne({ _id: new ObjectId(oid.toHexString()) }), DuplicateKeyError);
  assert.throws(() => users.insertOne({ _id: oid.toHexString() }), DuplicateKeyError, 'hex string equals its ObjectId');
  assert.equal(users.countDocuments(), 2);
  assert.equal(before.data.length, 1);
});

test('round-trips every supported value type', (t) => {
  const { db } = makeDb(t);
  const doc = {
    str: 'héllo 👋', empty: '', int: 7, neg: -3, float: 1.5, big: 2 ** 40, zero: 0,
    nan: NaN, inf: Infinity, t: true, f: false, nil: null,
    date: new Date('2024-01-02T03:04:05.006Z'), buf: Buffer.from([0, 1, 255]),
    arr: [1, 'two', null, [3], { four: 4 }], nested: { a: { b: { c: 'deep' } } },
    emptyObj: {}, emptyArr: [], oid: new ObjectId(),
  };
  const { insertedId } = db.collection('types').insertOne(doc);
  const back = db.collection('types').findOne({ _id: insertedId });
  const { _id, ...rest } = back;
  assert.deepEqual(rest, doc);
  assert.ok(Number.isNaN(back.nan));
  assert.ok(Buffer.isBuffer(back.buf));
  assert.ok(back.date instanceof Date);
});

test('fields set to undefined are skipped, like JSON', (t) => {
  const { db } = makeDb(t);
  const { insertedId } = db.collection('u').insertOne({ a: 1, b: undefined, nested: { c: undefined, d: 2 } });
  const back = db.collection('u').findOne({ _id: insertedId });
  assert.equal('b' in back, false);
  assert.deepEqual(back.nested, { d: 2 });
});

test('rejects anything that is not a plain object', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  for (const bad of [undefined, null, 'x', 1, true, [], [{ a: 1 }], new Date(), new Map(), new (class Person {})(), new ObjectId()]) {
    assert.throws(() => users.insertOne(bad), ValidationError, `value ${String(bad)}`);
  }
  assert.deepEqual(filesIn(dir), [], 'nothing was written');
});

test('rejects values that would be lost or changed on disk, naming the path', (t) => {
  const { db, dir } = makeDb(t);
  const users = db.collection('users');
  const circular = { a: 1 };
  circular.self = circular;
  const cases = [
    [{ fn() {} }, /Document\.fn/],
    [{ s: Symbol('x') }, /Document\.s/],
    [{ n: 10n }, /BigInt/],
    [{ r: /abc/i }, /RegExp/],
    [{ d: new Date('nope') }, /invalid Date/],
    [{ m: new Map() }, /Document\.m/],
    [{ deep: { list: [1, () => 2] } }, /Document\.deep\.list\[1\]/],
    [{ arr: [undefined] }, /undefined/],
    [circular, /circular/],
    [{ $set: 1 }, /cannot start with "\$"/],
    [{ 'a.b': 1 }, /cannot contain "\."/],
    [{ _id: null }, /_id/],
    [{ _id: [1, 2] }, /_id/],
    [{ ['bad\0key']: 1 }, /null character/],
    [JSON.parse('{"__proto__": {"x": 1}}'), /__proto__/],
  ];
  for (const [doc, msg] of cases) {
    assert.throws(() => users.insertOne(doc), (err) => err instanceof ValidationError && msg.test(err.message), String(msg));
  }
  assert.deepEqual(filesIn(dir), []);
});

test('a shared (non-circular) object used twice is fine', (t) => {
  const { db } = makeDb(t);
  const shared = { x: 1 };
  assert.doesNotThrow(() => db.collection('u').insertOne({ a: shared, b: shared, c: [shared, shared] }));
});

test('objects with a null prototype are accepted', (t) => {
  const { db } = makeDb(t);
  const doc = Object.create(null);
  doc.name = 'NoProto';
  db.collection('u').insertOne(doc);
  assert.equal(db.collection('u').findOne({ name: 'NoProto' }).name, 'NoProto');
});
