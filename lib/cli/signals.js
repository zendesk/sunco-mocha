'use strict';

/*
See: https://nodejs.org/api/process.html#signal-events
'SIGKILL' cannot have a listener installed, it will unconditionally terminate
Node.js on all platforms. 'SIGSTOP' cannot have a listener installed. 'SIGBUS',
'SIGFPE', 'SIGSEGV', and 'SIGILL', when not raised artificially using kill,
inherently leave the process in a state from which it is not safe to call JS
listeners. Doing so might cause the process to stop responding.
*/

exports.fatalSignals = [
  'SIGABRT',
  'SIGIOT',
  'SIGQUIT',
  'SIGSYS',
  'SIGUNUSED',
  'SIGXCPU',
  'SIGXFSZ'
];
