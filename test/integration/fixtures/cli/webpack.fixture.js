const ansi = require('strip-ansi');
const dep = require('./webpack-dep.fixture');

module.exports = function(foo) {
  return dep(ansi(foo));
}
