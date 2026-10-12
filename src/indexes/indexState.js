'use strict';

const { keysForDocument, keyForQueryValue } = require('./indexKey');

/**
 * Index file layout:
 *   { version: 1, sourceHash, fields: ['city', ...],
 *     entries: [ { field: 'city', keys: [ ['s"Cairo"', [0, 2]], ... ] } ] }
 *
 * Positions point into the collection's data array. sourceHash is the SHA-1 of the
 * collection file the index was built from; if the file changes in any way the
 * index is rebuilt, so a stale index can never hide a document.
 */
function buildIndexState(docs, fields, sourceHash) {
  const entries = fields.map((field) => {
    const map = new Map();
    docs.forEach((doc, position) => {
      for (const key of keysForDocument(doc, field)) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(position);
      }
    });
    return { field, keys: [...map.entries()] };
  });
  return { version: 1, sourceHash, fields: [...fields], entries };
}

/**
 * Candidate positions for a query, using the first indexed field whose value can be
 * looked up. Returns null when no index applies (the caller scans every document).
 * Candidates are always re-checked against the full query by the caller.
 */
function findCandidates(state, query) {
  if (!state) return null;
  for (const field of Object.keys(query)) {
    if (!state.fields.includes(field)) continue;
    const key = keyForQueryValue(query[field]);
    if (key === undefined) continue;
    const entry = state.entries.find((e) => e.field === field);
    if (!entry) continue;
    const hit = entry.keys.find(([k]) => k === key);
    return hit ? hit[1] : [];
  }
  return null;
}

module.exports = { buildIndexState, findCandidates };
