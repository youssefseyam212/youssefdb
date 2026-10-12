'use strict';

const { ValidationError, IndexNotFoundError } = require('../errors');
const { buildIndexState } = require('../indexes/indexState');

/**
 * Removes an index by field ("age") or by name ("age_1").
 * Throws IndexNotFoundError if it does not exist.
 */
function dropIndex(collection, nameOrField) {
  if (typeof nameOrField !== 'string' || nameOrField.length === 0) {
    throw new ValidationError('dropIndex expects an index name such as "age_1" or a field name such as "age".');
  }
  const state = collection._store.readIndex();
  const fields = state ? state.fields : [];
  let field = null;
  if (fields.includes(nameOrField)) field = nameOrField;
  else if (nameOrField.endsWith('_1') && fields.includes(nameOrField.slice(0, -2))) field = nameOrField.slice(0, -2);
  if (field === null) throw new IndexNotFoundError(`Index "${nameOrField}" does not exist on "${collection.name}".`);

  const remaining = fields.filter((f) => f !== field);
  if (remaining.length === 0) {
    collection._store.removeIndex();
  } else {
    const { docs, hash } = collection._load();
    collection._store.writeIndex(buildIndexState(docs, remaining, hash));
  }
  return true;
}

module.exports = dropIndex;
