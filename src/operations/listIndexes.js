'use strict';

/** @returns {{ name: string, field: string }[]} */
function listIndexes(collection) {
  const state = collection._store.readIndex();
  return (state ? state.fields : []).map((field) => ({ name: `${field}_1`, field }));
}

module.exports = listIndexes;
