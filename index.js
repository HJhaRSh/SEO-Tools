// Root entrypoint forwarding to the compiled backend Express app
const app = require('./backend/dist/index.js');

module.exports = app;
module.exports.default = app;
