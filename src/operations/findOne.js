'use strict';

const find = require('./find');

/**
 * Returns the first matching document, or null when nothing matches.
 * @returns {Object|null}
 */
function findOne(collection, query) {
  const results = find(collection, query);
  return results.length > 0 ? results[0] : null;
}

module.exports = findOne;
