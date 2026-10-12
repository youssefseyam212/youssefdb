'use strict';

const { compileQuery } = require('../query/compileQuery');
const { requireQuery } = require('../utils/validate');

/**
 * Deletes the first matching document.
 * @returns {{ acknowledged: true, deletedCount: 0|1 }}
 */
function deleteOne(collection, filter) {
  const matches = compileQuery(requireQuery(filter, 'deleteOne'), 'Filter');
  const { docs } = collection._load();
  const position = docs.findIndex(matches);
  if (position === -1) return { acknowledged: true, deletedCount: 0 };
  docs.splice(position, 1);
  collection._commit(docs);
  return { acknowledged: true, deletedCount: 1 };
}

module.exports = deleteOne;
