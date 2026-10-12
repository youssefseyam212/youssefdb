# Changelog

## 2.0.0

A rewrite into a structured project, with every known bug fixed and a full test suite.

### Fixed
- `createIndex` crashed with ENOENT because it wrote to a path relative to the current folder.
- `find` returned no results after `createIndex`, because it compared ObjectIds with strings.
- `readIndex` read the collection file instead of the index file.
- `deleteMany` with several fields deleted documents matching any field instead of all of them.
- `deleteMany({})` deleted nothing.
- `find({ _id })` never matched, because ObjectIds were compared with `===`.
- `findOne` used loose `==`, so `{ age: '30' }` matched `30`; all methods are now type-strict.
- A collection named `collection` (or any `DB` method name) broke the database.
- `updateMany` crashed with a TypeError when the update had no `$set`.
- `findOne` returned `undefined` instead of `null` when nothing matched.
- Removed the unused `v8` import and the `fs` placeholder dependency.

### Added
- One file per operation under `src/operations`, plus separate query, index, storage and validation modules.
- `countDocuments`, `dropIndex`, `listIndexes`, `drop`, `db.listCollections`, and the `dir` option.
- Atomic writes, so a crash cannot leave a half-written collection file.
- Indexes that stay correct after every write and rebuild themselves if the data file changes.
- Clear error classes: `ValidationError`, `UnsupportedOperationError`, `DuplicateKeyError`, `CorruptFileError`, `IndexNotFoundError`.
- Duplicate `_id` detection, `insertMany` all-or-nothing, and validation that rejects values BSON would silently drop.
- 106 tests using Node's built-in test runner.

### Changed (breaking)
- `updateOne` / `updateMany` return `{ acknowledged, matchedCount, modifiedCount }`.
- `deleteOne` returns `acknowledged: true` when nothing matched.
- `deleteOne()` / `deleteMany()` / `updateOne()` / `updateMany()` require a filter; pass `{}` to match everything.
- Operators, regular expressions and dotted paths in queries now throw `UnsupportedOperationError`.
- Default data folder is `./data` under the current working directory.

## 1.0.9
Last 1.x release.
