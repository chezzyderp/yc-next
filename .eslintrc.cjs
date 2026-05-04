module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2022,
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  ignorePatterns: ["dist", "runtime/next-server.js"],
  globals: {
    describe: "readonly",
    it: "readonly",
    expect: "readonly",
    vi: "readonly",
    beforeAll: "readonly",
    afterAll: "readonly",
    beforeEach: "readonly",
    afterEach: "readonly",
  },
  rules: {
    curly: ["error", "all"],
    "brace-style": ["error", "1tbs", { allowSingleLine: false }],
    "no-restricted-syntax": [
      "error",
      {
        selector: "IfStatement[test.type='AwaitExpression']",
        message: "Assign the awaited value to a const before testing it in an if.",
      },
      {
        selector:
          "IfStatement[test.type='UnaryExpression'][test.operator='!'][test.argument.type='AwaitExpression']",
        message: "Assign the awaited value to a const before testing it in an if.",
      },
      {
        selector: "IfStatement[test.type='LogicalExpression'][test.left.type='AwaitExpression']",
        message: "Assign the awaited value to a const before testing it in an if.",
      },
      {
        selector: "IfStatement[test.type='LogicalExpression'][test.right.type='AwaitExpression']",
        message: "Assign the awaited value to a const before testing it in an if.",
      },
    ],
    "padding-line-between-statements": [
      "error",
      { blankLine: "always", prev: "*", next: "return" },
      { blankLine: "always", prev: "*", next: "throw" },
      { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
      { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
      { blankLine: "always", prev: "expression", next: ["const", "let", "var"] },
      { blankLine: "always", prev: "*", next: ["if", "for", "while", "switch", "try", "do"] },
      { blankLine: "always", prev: ["if", "for", "while", "switch", "try", "do"], next: "*" },
      { blankLine: "always", prev: "directive", next: "*" },
      { blankLine: "always", prev: "import", next: "*" },
      { blankLine: "any", prev: "import", next: "import" },
      { blankLine: "always", prev: "*", next: "export" },
      { blankLine: "any", prev: "export", next: "export" },
      { blankLine: "always", prev: "function", next: "*" },
      { blankLine: "always", prev: "*", next: "function" },
    ],
    "lines-between-class-members": ["error", "always", { exceptAfterSingleLine: true }],
  },
};
