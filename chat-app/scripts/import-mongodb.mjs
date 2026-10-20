import env from '@next/env';
import { createRequire } from 'node:module';
import { db, closeDatabase } from '../lib/database.mjs';
import { importLegacy } from '../lib/import-legacy.mjs';
env.loadEnvConfig(process.cwd());
if (!process.env.MIGRATION_MONGODB_URI) throw new Error('Set MIGRATION_MONGODB_URI for the read-only source.');
const { MongoClient } = createRequire(import.meta.url)('mongodb');
const mongo = await new MongoClient(process.env.MIGRATION_MONGODB_URI).connect();
try { console.log('Imported record counts:', await importLegacy(mongo.db(process.env.MIGRATION_MONGODB_DB || 'hello_chat'), await db())); }
finally { await mongo.close(); await closeDatabase(); }
