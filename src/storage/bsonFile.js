'use strict';

const fs = require('fs');
const crypto = require('crypto');
const BSON = require('bson');
const { CorruptFileError } = require('../errors');

const SERIALIZE_OPTIONS = { ignoreUndefined: true, checkKeys: false };
const DESERIALIZE_OPTIONS = { promoteBuffers: true };

// bson keeps one shared buffer for serialize() (17 MB by default) and throws on
// anything larger. A collection is one BSON document, so grow it when needed.
let internalBufferSize = 17 * 1024 * 1024;

function serialize(value) {
  const size = BSON.calculateObjectSize(value, SERIALIZE_OPTIONS);
  if (size > internalBufferSize) {
    internalBufferSize = size;
    BSON.setInternalBufferSize(size);
  }
  return BSON.serialize(value, SERIALIZE_OPTIONS);
}

const hashBytes = (bytes) => crypto.createHash('sha1').update(bytes).digest('hex');

/**
 * Reads a BSON file. Returns null if the file does not exist.
 * Throws CorruptFileError (and never touches the file) if it cannot be parsed.
 */
function readBsonFile(filePath) {
  let bytes;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  if (bytes.length === 0) {
    throw new CorruptFileError(`${filePath} is empty, so it is not a valid BSON file.`, filePath);
  }
  try {
    return { value: BSON.deserialize(bytes, DESERIALIZE_OPTIONS), hash: hashBytes(bytes), size: bytes.length };
  } catch (err) {
    throw new CorruptFileError(`${filePath} could not be read as BSON: ${err.message}`, filePath);
  }
}

/**
 * Writes a BSON file atomically: the data goes to a temporary file in the same
 * folder, which is then renamed over the old file. A crash mid-write leaves the
 * previous version intact instead of a half-written file.
 */
function writeBsonFile(filePath, value, dir) {
  const bytes = serialize(value);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpPath, bytes);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // the temporary file was never created or is already gone
    }
    throw err;
  }
  return { hash: hashBytes(bytes), size: bytes.length };
}

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

module.exports = { readBsonFile, writeBsonFile, removeFile };
