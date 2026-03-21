'use strict';

module.exports = {
  testMatch: ['<rootDir>/test/connectivity/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.worktrees/'],
  modulePathIgnorePatterns: ['/.worktrees/'],
};
