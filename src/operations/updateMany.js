'use strict';

const { compileQuery } = require('../query/compileQuery');
const { compileUpdate } = require('../query/compileUpdate');
const { requireQuery } = require('../utils/validate');

/**
 * Applies a $set update to every matching document in one write.
 * If the update fails for any document, nothing is saved.
 * @returns {{ acknowledged: true, matchedCount: number, modifiedCount: number }}
 */
function updateMany(collection, filter, update) {
  const matches = compileQuery(requireQuery(filter, 'updateMany'), 'Filter');
  const apply = compileUpdate(update);
  const { docs } = collection._load();
  let matchedCount = 0;
  let modifiedCount = 0;
  for (const doc of docs) {
    if (!matches(doc)) continue;
    matchedCount++;
    if (apply(doc)) modifiedCount++;
  }
  if (modifiedCount > 0) collection._commit(docs);
  return { acknowledged: true, matchedCount, modifiedCount };
}

module.exports = updateMany;
