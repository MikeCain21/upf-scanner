const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "lib/browser-polyfill.js",
      "node_modules/**",
      "scripts/**",
      "test/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        chrome: "readonly",
        browser: "readonly",
        importScripts: "readonly",
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "eqeqeq": "error",
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["lib/*.js", "content/sites/*.js"],
    languageOptions: {
      globals: globals.commonjs,
    },
  },
];
