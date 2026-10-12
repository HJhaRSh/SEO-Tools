// Entrypoint forwarding to compiled TypeScript dist/index.js
const app = require('./dist/index.js');

module.exports = app;
module.exports.default = app;
