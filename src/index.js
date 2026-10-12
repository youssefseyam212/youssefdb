'use strict';

const { ObjectId } = require('bson');
const { DB } = require('./DB');
const { Collection } = require('./Collection');
const errors = require('./errors');

// `const DB = require('youssefdb')` keeps working as in 1.x;
// `const { DB, ObjectId } = require('youssefdb')` works too.
module.exports = DB;
module.exports.DB = DB;
module.exports.Collection = Collection;
module.exports.ObjectId = ObjectId;
Object.assign(module.exports, errors);
