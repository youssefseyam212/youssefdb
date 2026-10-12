'use strict';

const { ValidationError, UnsupportedOperationError } = require('../errors');
const { assertPlainObject, assertFieldName, assertStorable } = require('../utils/validate');
const { hasOwn } = require('../utils/types');
const { valuesEqual } = require('../utils/equals');

/**
 * Validates an update once and returns apply(doc) => boolean (true if the document changed).
 * Only { $set: { field: value } } is supported.
 */
function compileUpdate(update) {
  assertPlainObject(update, 'Update');
  const ops = Object.keys(update);
  if (ops.length === 0) {
    throw new ValidationError('Update is empty. Use { $set: { field: value } }.');
  }
  for (const op of ops) {
    if (!op.startsWith('$')) {
      throw new ValidationError(
        `Update must use an operator such as $set (found "${op}"). Replacing whole documents is not supported.`
      );
    }
    if (op !== '$set') {
      throw new UnsupportedOperationError(`Update operator "${op}" is not supported. Only $set is available.`);
    }
  }

  const set = update.$set;
  assertPlainObject(set, '$set');
  const changes = Object.keys(set).map((field) => {
    assertFieldName(field, '$set');
    if (set[field] === undefined) {
      throw new ValidationError(`$set.${field} is undefined. Use null to clear a field.`);
    }
    assertStorable(set[field], `$set.${field}`);
    return [field, set[field]];
  });

  return function apply(doc) {
    let changed = false;
    for (const [field, value] of changes) {
      if (field === '_id') {
        if (!valuesEqual(doc._id, value)) {
          throw new ValidationError('_id cannot be changed with $set.');
        }
        continue;
      }
      if (!hasOwn(doc, field) || !valuesEqual(doc[field], value)) {
        doc[field] = value;
        changed = true;
      }
    }
    return changed;
  };
}

module.exports = { compileUpdate };
