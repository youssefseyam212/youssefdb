'use strict';

const { compileQuery } = require('../query/compileQuery');
const { compileUpdate } = require('../query/compileUpdate');
const { requireQuery } = require('../utils/validate');

/**
 * Applies a $set update to the first matching document.
 * The file is only rewritten when a value actually changes.
 * @returns {{ acknowledged: true, matchedCount: 0|1, modifiedCount: 0|1 }}
 */
function updateOne(collection, filter, update) {
  const matches = compileQuery(requireQuery(filter, 'updateOne'), 'Filter');
  const apply = compileUpdate(update);
  const { docs } = collection._load();
  const doc = docs.find(matches);
  if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  const changed = apply(doc);
  if (changed) collection._commit(docs);
  return { acknowledged: true, matchedCount: 1, modifiedCount: changed ? 1 : 0 };
}

module.exports = updateOne;
