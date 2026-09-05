import nextPlugin from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextPlugin,
  ...nextTypescript,
  {
    rules: {
      "import/order": ["error", {
        "newlines-between": "always",
        groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
      }],
    },
  },
];
