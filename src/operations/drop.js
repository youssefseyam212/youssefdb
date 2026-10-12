'use strict';

/**
 * Deletes the collection's data and index files.
 * @returns {boolean} true if anything was deleted
 */
function drop(collection) {
  return collection._store.removeAll();
}

module.exports = drop;
