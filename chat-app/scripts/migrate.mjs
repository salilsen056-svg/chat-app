import env from '@next/env';
import { db, closeDatabase } from '../lib/database.mjs';
env.loadEnvConfig(process.cwd());
try { await db(); console.log('PostgreSQL schema is ready.'); } finally { await closeDatabase(); }
