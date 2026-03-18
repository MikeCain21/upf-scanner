'use strict';

module.exports = {
  testPathIgnorePatterns: [
    '/node_modules/',
    'connectivity', // excluded from npm test — run with npm run test:connectivity
  ],
};
