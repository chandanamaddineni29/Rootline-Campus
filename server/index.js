'use strict';

const express = require('express');
const path = require('node:path');
const { projectRoot, port } = require('./config');
const apiRouter = require('./routes/api');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api', apiRouter);
app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));
app.use('/data', (_request, response) => response.status(404).json({ error: 'Not found' }));
app.use(express.static(projectRoot, { extensions: ['html'], dotfiles: 'deny' }));

const server = app.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`Rootline Campus Analytics available at http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down Rootline…`);
  server.close(() => {
    try { require('./db/database').database.close(); }
    finally { process.exit(0); }
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
