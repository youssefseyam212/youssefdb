'use strict';

const { ValidationError, UnsupportedOperationError } = require('../errors');
const { isPlainObject, isBsonValue, isDate, isBinary } = require('./types');

const COLLECTION_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const NUMBER_WRAPPERS = new Set(['Long', 'Int32', 'Double']);

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (value instanceof Date) return 'a Date';
  return typeof value === 'object' ? `a ${value.constructor ? value.constructor.name : 'object'}` : `a ${typeof value}`;
}

function assertCollectionName(name) {
  if (typeof name !== 'string' || !COLLECTION_NAME.test(name)) {
    throw new ValidationError(
      `Invalid collection name ${JSON.stringify(name)}: use 1-64 letters, digits, "_" or "-".`
    );
  }
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new ValidationError(`${label} must be a plain object, got ${describe(value)}.`);
  }
}

/** Optional query: undefined or null mean "match everything". */
function normalizeQuery(query, label = 'Query') {
  if (query === undefined || query === null) return {};
  assertPlainObject(query, label);
  return query;
}

/** Required query for writes: deleteMany() with no filter is almost always a mistake. */
function requireQuery(query, method) {
  if (query === undefined || query === null) {
    throw new ValidationError(`${method} needs a filter. Pass {} to match every document.`);
  }
  assertPlainObject(query, 'Filter');
  return query;
}

/** Field names used in queries, updates and indexes: top-level, no operators, no dotted paths. */
function assertFieldName(field, context) {
  if (typeof field !== 'string' || field.length === 0) {
    throw new ValidationError(`${context}: field names must be non-empty strings.`);
  }
  if (field === '__proto__') {
    throw new ValidationError(`${context}: "__proto__" cannot be used as a field name.`);
  }
  if (field.startsWith('$')) {
    throw new UnsupportedOperationError(
      `${context}: "${field}" is an operator, and operators are not supported. youssefdb matches exact values on top-level fields.`
    );
  }
  if (field.includes('.')) {
    throw new UnsupportedOperationError(
      `${context}: dotted paths like "${field}" are not supported. Match the whole embedded document instead.`
    );
  }
}

/**
 * Checks that a value can be stored without being silently changed or dropped.
 * Throws a ValidationError naming the exact path of the first bad value.
 */
function assertStorable(value, path, seen = new WeakSet()) {
  const t = typeof value;
  if (value === null || t === 'string' || t === 'number' || t === 'boolean') return;
  if (t === 'bigint') {
    throw new ValidationError(`${path} is a BigInt. BSON reads 64-bit integers back as Numbers, so store a Number instead.`);
  }
  if (t === 'undefined') {
    throw new ValidationError(`${path} is undefined. Remove the field or use null.`);
  }
  if (t === 'function' || t === 'symbol') {
    throw new ValidationError(`${path} is ${describe(value)}, which cannot be stored.`);
  }
  if (isDate(value)) {
    if (Number.isNaN(value.getTime())) throw new ValidationError(`${path} is an invalid Date.`);
    return;
  }
  if (value instanceof RegExp) {
    throw new ValidationError(`${path} is a RegExp. Store the pattern as a string instead.`);
  }
  if (isBsonValue(value)) {
    if (NUMBER_WRAPPERS.has(value._bsontype)) {
      throw new ValidationError(`${path} is a BSON ${value._bsontype}. It is read back as a plain Number, so store a Number instead.`);
    }
    return;
  }
  if (isBinary(value)) return;

  if (seen.has(value)) throw new ValidationError(`${path} contains a circular reference.`);
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, i) => assertStorable(item, `${path}[${i}]`, seen));
  } else if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (key.includes('\0')) throw new ValidationError(`${path} has a field name containing a null character.`);
      if (key === '__proto__') throw new ValidationError(`${path} has a field named "__proto__", which cannot be stored.`);
      if (value[key] === undefined) continue; // undefined fields are skipped, like JSON.stringify
      assertStorable(value[key], `${path}.${key}`, seen);
    }
  } else {
    throw new ValidationError(
      `${path} is ${describe(value)}. Only plain objects, arrays, strings, numbers, booleans, null, Dates, Buffers and BSON values can be stored.`
    );
  }
  seen.delete(value);
}

/** A whole document: plain object, valid top-level field names, storable values. */
function assertDocument(doc, label = 'Document') {
  assertPlainObject(doc, label);
  for (const key of Object.keys(doc)) {
    if (key.startsWith('$')) throw new ValidationError(`${label}: field names cannot start with "$" ("${key}").`);
    if (key.includes('.')) throw new ValidationError(`${label}: field names cannot contain "." ("${key}").`);
  }
  if (doc._id === null || Array.isArray(doc._id)) {
    throw new ValidationError(`${label}: _id cannot be null or an array.`);
  }
  assertStorable(doc, label);
}

module.exports = {
  assertCollectionName,
  assertPlainObject,
  normalizeQuery,
  requireQuery,
  assertFieldName,
  assertStorable,
  assertDocument,
};
