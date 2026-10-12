'use strict';

/** Base class for every error thrown by youssefdb. */
class YoussefDBError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** An argument has the wrong type or shape (bad query, bad document, bad name). */
class ValidationError extends YoussefDBError {}

/** A query or update uses a feature youssefdb does not support yet. */
class UnsupportedOperationError extends YoussefDBError {}

/** A document with the same _id already exists in the collection. */
class DuplicateKeyError extends YoussefDBError {
  constructor(message, id) {
    super(message);
    this.id = id;
  }
}

/** A collection file on disk cannot be read as a youssefdb collection. */
class CorruptFileError extends YoussefDBError {
  constructor(message, filePath) {
    super(message);
    this.filePath = filePath;
  }
}

/** dropIndex was called for an index that does not exist. */
class IndexNotFoundError extends YoussefDBError {}

module.exports = {
  YoussefDBError,
  ValidationError,
  UnsupportedOperationError,
  DuplicateKeyError,
  CorruptFileError,
  IndexNotFoundError,
};
