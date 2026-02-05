import { Hono } from 'hono';
import { env } from './env';
import api from './api';
import './db';

const app = new Hono();

app.route('/', api);

console.log(`🚀 LAZY FLOW server starting...`);
console.log(`   Environment: ${env.NODE_ENV}`);
console.log(`   Port: ${env.PORT}`);
console.log(`   Database: ${env.DB_PATH}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
