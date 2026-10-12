'use strict';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** True for {} literals, Object.create(null) and documents returned by BSON. */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  if (value._bsontype !== undefined) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** True for any BSON value class (ObjectId, Long, Decimal128, Binary, ...). */
const isBsonValue = (value) =>
  value !== null && typeof value === 'object' && typeof value._bsontype === 'string';

const isObjectId = (value) => isBsonValue(value) && value._bsontype === 'ObjectId';

const isDate = (value) => value instanceof Date;

const isBinary = (value) => value instanceof Uint8Array; // includes Buffer

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;
const isObjectIdString = (value) => typeof value === 'string' && OBJECT_ID_HEX.test(value);

module.exports = {
  hasOwn,
  isPlainObject,
  isBsonValue,
  isObjectId,
  isDate,
  isBinary,
  isObjectIdString,
};
