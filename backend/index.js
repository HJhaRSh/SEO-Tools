// Vercel Express service entrypoint — forwards to compiled TypeScript dist
const app = require('./dist/index.js');

module.exports = app;
module.exports.default = app;
