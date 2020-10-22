'use strict';

const path = require('path');

// const ROOT = path.join(__dirname, '..', '..', '..', 'node_modules');

module.exports = {
  entry: path.join(__dirname, 'webpack.fixture.js'),
  mode: 'development',
  resolve: {modules: [path.join(__dirname, 'mode_nodules')]}
};

