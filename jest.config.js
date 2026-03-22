'use strict';

module.exports = {
  testMatch: ['<rootDir>/test/unit/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'lib/**/*.js',
    'content/sites/**/*.js',
    'background/**/*.js',
    'content/**/*.js',
    'popup/**/*.js',
    '!lib/browser-polyfill.js',
  ],
};
