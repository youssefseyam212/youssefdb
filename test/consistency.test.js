'use strict';

/**
 * Randomised check: a collection with indexes on every field and the same collection
 * with no indexes must return identical results for every query after every write.
 * Uses a fixed seed so any failure can be reproduced.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('../src');
const { makeDb } = require('./helpers');

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

test('indexed and unindexed collections always agree (2,000 random operations)', (t) => {
  const { db } = makeDb(t);
  const plain = db.collection('plain');
  const indexed = db.collection('indexed');
  const fields = ['a', 'b', 'tags', '_id'];
  fields.forEach((f) => indexed.createIndex(f));

  const rand = rng(12345);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const ids = Array.from({ length: 6 }, () => new ObjectId());
  const values = [0, 1, 2, '1', 'x', 'X', null, true, false, NaN, new Date(1000), ['x', 1], [], { k: 1 }];
  const randomValue = () => pick(values);
  const randomDoc = () => {
    const doc = {};
    if (rand() < 0.8) doc.a = randomValue();
    if (rand() < 0.6) doc.b = randomValue();
    if (rand() < 0.4) doc.tags = [randomValue(), randomValue()].filter((v) => v !== undefined && !Array.isArray(v));
    return doc;
  };
  const randomQuery = () => {
    const q = {};
    const n = Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const f = pick(fields);
      q[f] = f === '_id' ? pick([pick(ids), pick(ids).toHexString(), 'missing']) : pick([...values, undefined]);
    }
    return q;
  };

  let inserted = 0;
  for (let step = 0; step < 2000; step++) {
    const r = rand();
    if (r < 0.35) {
      const doc = randomDoc();
      if (inserted < ids.length && rand() < 0.5) doc._id = ids[inserted++];
      plain.insertOne(doc);
      indexed.insertOne(doc);
    } else if (r < 0.5) {
      const q = randomQuery();
      const set = { [pick(['a', 'b'])]: randomValue() };
      assert.deepEqual(indexed.updateMany(q, { $set: set }), plain.updateMany(q, { $set: set }));
    } else if (r < 0.6) {
      const q = randomQuery();
      assert.deepEqual(indexed.deleteOne(q), plain.deleteOne(q));
    } else if (r < 0.63) {
      const q = randomQuery();
      assert.deepEqual(indexed.deleteMany(q), plain.deleteMany(q));
    } else {
      const q = randomQuery();
      const strip = (docs) => docs.map(({ _id, ...rest }) => rest);
      assert.deepEqual(strip(indexed.find(q)), strip(plain.find(q)), `step ${step}: ${JSON.stringify(q)}`);
      assert.equal(indexed.countDocuments(q), plain.countDocuments(q));
    }
  }
});
