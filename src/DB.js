'use strict';

const fs = require('fs');
const path = require('path');
const { Collection } = require('./Collection');
const { ValidationError } = require('./errors');
const { assertCollectionName } = require('./utils/validate');
const { isPlainObject } = require('./utils/types');

const COLLECTION_FILE = /^([A-Za-z0-9_-]{1,64})\.bson$/;

/**
 * A database is a folder. Each collection inside it is one BSON file.
 *
 *   const db = new DB();                      // ./data
 *   const db = new DB({ dir: './my-data' });  // any folder
 */
class DB {
  constructor(options = {}) {
    if (!isPlainObject(options)) {
      throw new ValidationError('DB options must be an object, for example new DB({ dir: "./data" }).');
    }
    const { dir = path.join(process.cwd(), 'data') } = options;
    if (typeof dir !== 'string' || dir.length === 0) {
      throw new ValidationError('DB option "dir" must be a non-empty string.');
    }
    this.dir = path.resolve(dir);
    this._collections = new Map();
  }

  /** Returns the collection with this name; the same object every time. Files are created on first write. */
  collection(name) {
    assertCollectionName(name);
    if (!this._collections.has(name)) this._collections.set(name, new Collection(name, this.dir));
    return this._collections.get(name);
  }

  /** Names of the collections that have a file on disk, sorted. */
  listCollections() {
    let entries;
    try {
      entries = fs.readdirSync(this.dir);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .map((file) => COLLECTION_FILE.exec(file))
      .filter(Boolean)
      .map((match) => match[1])
      .sort();
  }
}

module.exports = { DB };
