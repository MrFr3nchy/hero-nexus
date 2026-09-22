#!/usr/bin/env node
//
// Do the two native dependencies actually work?
//
// `npm ci` does not always finish them. npm 12 blocks lifecycle scripts
// unless they are allow-listed, and a platform with no prebuilt binary needs
// the compile that script runs — so an install can succeed and leave
// better-sqlite3 without its `.node` file. Nothing notices until two minutes
// into `next build`, where it surfaces as "Could not locate the bindings
// file" in the middle of page collection and reads as a Next problem.
//
// `require('better-sqlite3')` is not enough on its own: the binding is loaded
// lazily by the `Database` constructor, so the import succeeds on a broken
// install. Opening an in-memory database is the cheapest thing that is not a
// lie.
//
//   node deploy/check-native.js
//
// Exits 0 when both load, 1 with the reason when either does not.
// `./cli deploy` runs this after `npm ci` and rebuilds on a failure.

let failed = false;

try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('select 1').get();
  db.close();
  console.log('better-sqlite3 ok');
} catch (err) {
  failed = true;
  console.error('better-sqlite3 FAILED:', err.message.split('\n')[0]);
}

try {
  const argon2 = require('@node-rs/argon2');
  if (typeof argon2.hash !== 'function') {
    throw new Error('the module loaded but has no hash()');
  }
  console.log('@node-rs/argon2 ok');
} catch (err) {
  failed = true;
  console.error('@node-rs/argon2 FAILED:', err.message.split('\n')[0]);
}

process.exit(failed ? 1 : 0);
