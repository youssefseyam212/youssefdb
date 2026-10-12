'use strict';

const { compileQuery } = require('../query/compileQuery');
const { requireQuery } = require('../utils/validate');

/**
 * Deletes every document that matches all fields of the filter.
 * Pass {} to delete every document; calling it with no filter throws.
 * @returns {{ acknowledged: true, deletedCount: number }}
 */
function deleteMany(collection, filter) {
  const matches = compileQuery(requireQuery(filter, 'deleteMany'), 'Filter');
  const { docs } = collection._load();
  const kept = docs.filter((doc) => !matches(doc));
  const deletedCount = docs.length - kept.length;
  if (deletedCount > 0) collection._commit(kept);
  return { acknowledged: true, deletedCount };
}

module.exports = deleteMany;
