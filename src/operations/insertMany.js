'use strict';

const { ValidationError } = require('../errors');
const { assertDocument } = require('../utils/validate');
const { withId, assertUniqueIds } = require('./_prepare');

/**
 * Inserts several documents in one write. Either every document is inserted or,
 * if any of them is invalid or has a duplicate _id, none is.
 * @returns {{ acknowledged: true, insertedCount: number, insertedIds: Object<number, any> }}
 */
function insertMany(collection, docs) {
  if (!Array.isArray(docs)) {
    throw new ValidationError('insertMany expects an array of documents.');
  }
  docs.forEach((doc, i) => assertDocument(doc, `Document at index ${i}`));
  if (docs.length === 0) return { acknowledged: true, insertedCount: 0, insertedIds: {} };

  const { docs: existing } = collection._load();
  const newDocs = docs.map(withId);
  assertUniqueIds(existing, newDocs);
  collection._commit(existing.concat(newDocs));

  const insertedIds = {};
  newDocs.forEach((doc, i) => {
    insertedIds[i] = doc._id;
  });
  return { acknowledged: true, insertedCount: newDocs.length, insertedIds };
}

module.exports = insertMany;
