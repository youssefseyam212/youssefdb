'use strict';

const find = require('./find');

/** Number of documents that match the query. */
function countDocuments(collection, query) {
  return find(collection, query).length;
}

module.exports = countDocuments;
