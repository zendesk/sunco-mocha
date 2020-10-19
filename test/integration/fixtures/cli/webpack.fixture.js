const ansi = require('strip-ansi');

module.exports = function(foo) {
  return ansi(foo);
}
