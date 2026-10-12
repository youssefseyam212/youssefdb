'use strict';

const { assertDocument } = require('../utils/validate');
const { withId, assertUniqueIds } = require('./_prepare');

/**
 * Inserts one document. An _id is generated unless the document has one.
 * @returns {{ acknowledged: true, insertedId: any }}
 */
function insertOne(collection, doc) {
  assertDocument(doc);
  const { docs } = collection._load();
  const newDoc = withId(doc);
  assertUniqueIds(docs, [newDoc]);
  docs.push(newDoc);
  collection._commit(docs);
  return { acknowledged: true, insertedId: newDoc._id };
}

module.exports = insertOne;
