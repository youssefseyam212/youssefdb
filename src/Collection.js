'use strict';

const { CollectionStore } = require('./storage/CollectionStore');
const { buildIndexState } = require('./indexes/indexState');

const insertOne = require('./operations/insertOne');
const insertMany = require('./operations/insertMany');
const find = require('./operations/find');
const findOne = require('./operations/findOne');
const countDocuments = require('./operations/countDocuments');
const updateOne = require('./operations/updateOne');
const updateMany = require('./operations/updateMany');
const deleteOne = require('./operations/deleteOne');
const deleteMany = require('./operations/deleteMany');
const createIndex = require('./operations/createIndex');
const dropIndex = require('./operations/dropIndex');
const listIndexes = require('./operations/listIndexes');
const drop = require('./operations/drop');

/**
 * One collection. Every call reads the collection file, works on the documents in
 * memory and, for writes, saves the whole file back. Nothing is cached between
 * calls, so two Collection objects (or two processes, one at a time) always see
 * the latest data on disk.
 *
 * Each method lives in its own file under src/operations.
 */
class Collection {
  constructor(name, dir) {
    this.name = name;
    this._store = new CollectionStore(dir, name);
  }

  /** @internal Reads { docs, hash } from disk. */
  _load() {
    return this._store.readDocs();
  }

  /** @internal Loads the index for this exact file content, rebuilding it if it is stale. */
  _loadIndex(docs, hash) {
    const state = this._store.readIndex();
    if (!state || state.fields.length === 0) return null;
    if (state.sourceHash === hash) return state;
    const rebuilt = buildIndexState(docs, state.fields, hash);
    this._store.writeIndex(rebuilt);
    return rebuilt;
  }

  /** @internal Saves documents, then rebuilds every index against the new file. */
  _commit(docs) {
    const fields = (this._store.readIndex() || { fields: [] }).fields;
    const hash = this._store.writeDocs(docs);
    if (fields.length > 0) this._store.writeIndex(buildIndexState(docs, fields, hash));
  }

  insertOne(doc) { return insertOne(this, doc); }
  insertMany(docs) { return insertMany(this, docs); }
  find(query) { return find(this, query); }
  findOne(query) { return findOne(this, query); }
  countDocuments(query) { return countDocuments(this, query); }
  updateOne(filter, update) { return updateOne(this, filter, update); }
  updateMany(filter, update) { return updateMany(this, filter, update); }
  deleteOne(filter) { return deleteOne(this, filter); }
  deleteMany(filter) { return deleteMany(this, filter); }
  createIndex(spec) { return createIndex(this, spec); }
  dropIndex(nameOrField) { return dropIndex(this, nameOrField); }
  listIndexes() { return listIndexes(this); }
  drop() { return drop(this); }
}

module.exports = { Collection };
