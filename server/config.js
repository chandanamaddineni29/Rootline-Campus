'use strict';

const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const dataDirectory = process.env.ROOTLINE_DATA_DIRECTORY
  ? path.resolve(process.env.ROOTLINE_DATA_DIRECTORY)
  : path.join(projectRoot, 'data');
const databasePath = path.join(dataDirectory, 'rootline.sqlite');
const port = Number(process.env.PORT || 3000);

module.exports = { projectRoot, dataDirectory, databasePath, port };
