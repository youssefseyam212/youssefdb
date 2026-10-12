'use strict';

const { isObjectId, isDate, isObjectIdString } = require('../utils/types');

/**
 * Turns a field value into a string key for the index, or undefined when the value
 * cannot be indexed (embedded documents, arrays as a whole, binary, other BSON types).
 * Two values that are equal under valuesEqual always produce the same key.
 */
function keyForStoredValue(value) {
  if (value === null || value === undefined) return 'null';
  switch (typeof value) {
    case 'string':
      return `s${JSON.stringify(value)}`;
    case 'number':
      return `n${Number.isNaN(value) ? 'NaN' : String(value === 0 ? 0 : value)}`;
    case 'boolean':
      return `b${value}`;
    default:
      if (isObjectId(value)) return `o${value.toHexString()}`;
      if (isDate(value)) return `d${value.getTime()}`;
      return undefined;
  }
}

/** All keys a document must be listed under for a field (arrays: one per element). */
function keysForDocument(doc, field) {
  const value = Object.prototype.hasOwnProperty.call(doc, field) ? doc[field] : undefined;
  const keys = new Set();
  const add = (v) => {
    const k = keyForStoredValue(v);
    if (k !== undefined) keys.add(k);
  };
  if (Array.isArray(value)) value.forEach(add);
  else add(value);
  return keys;
}

/**
 * The key to look up for a query value, or undefined when the index must not be used.
 * ObjectIds and 24-character hex strings match each other, so they always use a full scan.
 */
function keyForQueryValue(value) {
  if (Array.isArray(value) || isObjectId(value) || isObjectIdString(value)) return undefined;
  if (value !== null && value !== undefined && typeof value === 'object' && !isDate(value)) return undefined;
  return keyForStoredValue(value);
}

module.exports = { keysForDocument, keyForQueryValue };
