'use strict';

const { hasOwn, isPlainObject, isBsonValue, isObjectId, isDate, isBinary } = require('./types');

/**
 * Deep, type-strict equality used by queries and updates.
 *
 * - No type coercion: 30 does not equal '30'.
 * - ObjectIds compare by value; an ObjectId also equals its 24-character hex string,
 *   so users.find({ _id: '665f...' }) works with ids that came from JSON.
 * - Dates compare by time, binary data byte by byte, arrays element by element.
 * - Embedded documents compare key by key; key order does not matter.
 */
function valuesEqual(a, b) {
  if (a === b) return true;

  if (isObjectId(a) || isObjectId(b)) {
    const hexA = isObjectId(a) ? a.toHexString() : typeof a === 'string' ? a.toLowerCase() : null;
    const hexB = isObjectId(b) ? b.toHexString() : typeof b === 'string' ? b.toLowerCase() : null;
    return hexA !== null && hexA === hexB;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b);
  }

  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  if (isDate(a) || isDate(b)) {
    return isDate(a) && isDate(b) && Object.is(a.getTime(), b.getTime());
  }

  if (isBinary(a) || isBinary(b)) {
    if (!isBinary(a) || !isBinary(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  if (isBsonValue(a) || isBsonValue(b)) {
    if (!isBsonValue(a) || !isBsonValue(b) || a._bsontype !== b._bsontype) return false;
    return typeof a.equals === 'function' ? a.equals(b) : String(a) === String(b);
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => valuesEqual(item, b[i]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined);
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => hasOwn(b, k) && valuesEqual(a[k], b[k]));
  }

  return false;
}

module.exports = { valuesEqual };
