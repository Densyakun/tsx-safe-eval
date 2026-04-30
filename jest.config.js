const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  transformIgnorePatterns: [
    "node_modules/(?!(strip-json-comments)/)"
  ],
  moduleNameMapper: {
    "strip-json-comments": "<rootDir>/tests/__mocks__/strip-json-comments.js"
  }
};