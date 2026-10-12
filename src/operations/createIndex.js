'use strict';

const { ValidationError } = require('../errors');
const { assertFieldName } = require('../utils/validate');
const { isPlainObject } = require('../utils/types');
const { buildIndexState } = require('../indexes/indexState');

/** Accepts 'age', { age: 1 } or { age: -1 }. 1.x style { age: 35 } is also accepted and indexes the whole field. */
function fieldFromSpec(spec) {
  if (typeof spec === 'string') return spec;
  if (isPlainObject(spec)) {
    const keys = Object.keys(spec);
    if (keys.length !== 1) {
      throw new ValidationError('createIndex takes exactly one field, for example createIndex("age") or createIndex({ age: 1 }).');
    }
    return keys[0];
  }
  throw new ValidationError('createIndex expects a field name or an object such as { age: 1 }.');
}

/**
 * Creates an index on one top-level field and keeps it up to date on every write.
 * Creating an index that already exists does nothing.
 * @returns {string} the index name, e.g. "age_1"
 */
function createIndex(collection, spec) {
  const field = fieldFromSpec(spec);
  assertFieldName(field, 'createIndex');
  const { docs, hash } = collection._load();
  const state = collection._store.readIndex();
  const fields = state ? [...state.fields] : [];
  if (!fields.includes(field)) fields.push(field);
  collection._store.writeIndex(buildIndexState(docs, fields, hash));
  return `${field}_1`;
}

module.exports = createIndex;
