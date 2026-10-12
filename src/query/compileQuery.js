'use strict';

const { UnsupportedOperationError } = require('../errors');
const { normalizeQuery, assertFieldName, assertStorable } = require('../utils/validate');
const { hasOwn, isPlainObject } = require('../utils/types');
const { valuesEqual } = require('../utils/equals');

/**
 * Validates a query once and returns a predicate (doc) => boolean.
 *
 * Rules (a subset of MongoDB's):
 * - Every field in the query must match (AND).
 * - Exact, type-strict equality on top-level fields.
 * - null matches documents where the field is null or missing.
 * - If the stored value is an array and the query value is not, the document
 *   matches when any element equals the query value.
 * - Operators ($gt, $in, $or, ...) and dotted paths throw UnsupportedOperationError.
 */
function compileQuery(query, label) {
  const q = normalizeQuery(query, label);
  const conditions = Object.keys(q).map((field) => {
    assertFieldName(field, 'Query');
    const expected = q[field];
    if (isPlainObject(expected)) {
      const op = Object.keys(expected).find((k) => k.startsWith('$'));
      if (op) {
        throw new UnsupportedOperationError(
          `Query: the "${op}" operator on "${field}" is not supported. youssefdb matches exact values only.`
        );
      }
    }
    if (expected instanceof RegExp) {
      throw new UnsupportedOperationError(
        `Query: regular expressions (on "${field}") are not supported. youssefdb matches exact values only.`
      );
    }
    if (expected !== undefined) assertStorable(expected, `Query.${field}`);
    return { field, expected: expected === undefined ? null : expected };
  });

  return function matches(doc) {
    return conditions.every(({ field, expected }) => {
      const present = hasOwn(doc, field) && doc[field] !== undefined;
      const actual = present ? doc[field] : null;
      if (expected === null) return actual === null;
      if (!present) return false;
      if (valuesEqual(actual, expected)) return true;
      return Array.isArray(actual) && !Array.isArray(expected) && actual.some((item) => valuesEqual(item, expected));
    });
  };
}

module.exports = { compileQuery };
