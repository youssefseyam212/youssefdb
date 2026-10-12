'use strict';

const { ObjectId } = require('bson');
const { DuplicateKeyError } = require('../errors');
const { valuesEqual } = require('../utils/equals');

/**
 * Returns a copy of the document with _id first, generating an ObjectId when the
 * caller did not supply one. The caller's object is never modified.
 */
function withId(doc) {
  const { _id, ...rest } = doc;
  return { _id: _id === undefined ? new ObjectId() : _id, ...rest };
}

/** Throws DuplicateKeyError if any new _id already exists or repeats within the batch. */
function assertUniqueIds(existing, incoming) {
  const seen = [...existing];
  for (const doc of incoming) {
    if (seen.some((d) => valuesEqual(d._id, doc._id))) {
      throw new DuplicateKeyError(`A document with _id ${String(doc._id)} already exists.`, doc._id);
    }
    seen.push(doc);
  }
}

module.exports = { withId, assertUniqueIds };
