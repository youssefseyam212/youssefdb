'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId, Decimal128, Binary } = require('bson');
const { valuesEqual } = require('../src/utils/equals');

test('valuesEqual: primitives are type-strict', () => {
  assert.equal(valuesEqual(1, 1), true);
  assert.equal(valuesEqual(1, '1'), false);
  assert.equal(valuesEqual(0, false), false);
  assert.equal(valuesEqual(null, undefined), false);
  assert.equal(valuesEqual(NaN, NaN), true);
  assert.equal(valuesEqual(0, -0), true);
  assert.equal(valuesEqual('a', 'A'), false);
});

test('valuesEqual: ObjectIds and hex strings', () => {
  const id = new ObjectId();
  assert.equal(valuesEqual(id, new ObjectId(id.toHexString())), true);
  assert.equal(valuesEqual(id, id.toHexString().toUpperCase()), true);
  assert.equal(valuesEqual(id.toHexString(), id), true);
  assert.equal(valuesEqual(id, new ObjectId()), false);
  assert.equal(valuesEqual(id, 5), false);
  assert.equal(valuesEqual(id, null), false);
  assert.equal(valuesEqual(id, { id: id.toHexString() }), false);
});

test('valuesEqual: Dates, Buffers and other BSON values', () => {
  assert.equal(valuesEqual(new Date(5), new Date(5)), true);
  assert.equal(valuesEqual(new Date(5), new Date(6)), false);
  assert.equal(valuesEqual(new Date(5), 5), false);
  assert.equal(valuesEqual(new Date(5), {}), false);
  assert.equal(valuesEqual(Buffer.from([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(valuesEqual(Buffer.from([1, 2]), Buffer.from([1, 3])), false);
  assert.equal(valuesEqual(Buffer.from([1, 2]), Buffer.from([1])), false);
  assert.equal(valuesEqual(Buffer.from([1]), [1]), false);
  assert.equal(valuesEqual(Decimal128.fromString('1.5'), Decimal128.fromString('1.5')), true);
  assert.equal(valuesEqual(Decimal128.fromString('1.5'), Decimal128.fromString('2')), false);
  assert.equal(valuesEqual(Decimal128.fromString('1.5'), new Binary(Buffer.from([1]))), false);
  assert.equal(valuesEqual(Decimal128.fromString('1.5'), 1.5), false);
});

test('valuesEqual: arrays and embedded documents', () => {
  assert.equal(valuesEqual([1, [2, { a: 3 }]], [1, [2, { a: 3 }]]), true);
  assert.equal(valuesEqual([1, 2], [2, 1]), false);
  assert.equal(valuesEqual([1], { 0: 1 }), false);
  assert.equal(valuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(valuesEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(valuesEqual({ a: 1, b: undefined }, { a: 1 }), true, 'undefined fields are ignored, as on disk');
  assert.equal(valuesEqual({ a: 1 }, { b: 1 }), false);
  assert.equal(valuesEqual(new Map(), new Map()), false, 'non-plain objects are never equal');
});
