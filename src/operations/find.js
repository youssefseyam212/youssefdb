'use strict';

const { compileQuery } = require('../query/compileQuery');
const { normalizeQuery } = require('../utils/validate');
const { findCandidates } = require('../indexes/indexState');

/**
 * Returns every document that matches the query, in insertion order.
 * Uses an index when one exists for a queried field; results are identical either way.
 * @returns {Object[]}
 */
function find(collection, query) {
  const matches = compileQuery(query);
  const q = normalizeQuery(query);
  const { docs, hash } = collection._load();
  const candidates = findCandidates(collection._loadIndex(docs, hash), q);
  const pool = candidates === null ? docs : candidates.map((position) => docs[position]).filter(Boolean);
  return pool.filter(matches);
}

module.exports = find;
