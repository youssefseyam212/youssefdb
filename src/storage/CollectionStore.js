'use strict';

const path = require('path');
const { CorruptFileError } = require('../errors');
const { isPlainObject } = require('../utils/types');
const { readBsonFile, writeBsonFile, removeFile } = require('./bsonFile');

const isPosition = (p) => Number.isInteger(p) && p >= 0;

function isValidIndexState(v) {
  return (
    isPlainObject(v) &&
    v.version === 1 &&
    (v.sourceHash === null || typeof v.sourceHash === 'string') &&
    Array.isArray(v.fields) &&
    v.fields.every((f) => typeof f === 'string' && f.length > 0) &&
    Array.isArray(v.entries) &&
    v.entries.length === v.fields.length &&
    v.entries.every(
      (e, i) =>
        isPlainObject(e) &&
        e.field === v.fields[i] &&
        Array.isArray(e.keys) &&
        e.keys.every(
          (pair) =>
            Array.isArray(pair) &&
            pair.length === 2 &&
            typeof pair[0] === 'string' &&
            Array.isArray(pair[1]) &&
            pair[1].every(isPosition)
        )
    )
  );
}

/**
 * Owns the two files of one collection inside the database folder:
 *   <name>.bson        { data: [ ...documents ] }   (same layout as youssefdb 1.x)
 *   <name>.index.bson  { version, sourceHash, fields, entries }
 */
class CollectionStore {
  constructor(dir, name) {
    this.dir = dir;
    this.dataPath = path.join(dir, `${name}.bson`);
    this.indexPath = path.join(dir, `${name}.index.bson`);
  }

  /** Returns { docs, hash }. A missing file is an empty collection. */
  readDocs() {
    const file = readBsonFile(this.dataPath);
    if (file === null) return { docs: [], hash: null };
    const { value, hash } = file;
    if (!isPlainObject(value) || !Array.isArray(value.data) || !value.data.every(isPlainObject)) {
      throw new CorruptFileError(
        `${this.dataPath} is valid BSON but not a youssefdb collection (expected { data: [documents] }).`,
        this.dataPath
      );
    }
    return { docs: value.data, hash };
  }

  /** Returns the hash of the written bytes. */
  writeDocs(docs) {
    return writeBsonFile(this.dataPath, { data: docs }, this.dir).hash;
  }

  /** Returns the stored index state, or null if it is missing or unreadable. */
  readIndex() {
    try {
      const file = readBsonFile(this.indexPath);
      if (file === null) return null;
      const v = file.value;
      return isValidIndexState(v) ? v : null;
    } catch (err) {
      if (err instanceof CorruptFileError) return null; // indexes can always be rebuilt
      throw err;
    }
  }

  writeIndex(state) {
    writeBsonFile(this.indexPath, state, this.dir);
  }

  removeIndex() {
    return removeFile(this.indexPath);
  }

  removeAll() {
    const data = removeFile(this.dataPath);
    const index = removeFile(this.indexPath);
    return data || index;
  }
}

module.exports = { CollectionStore };
