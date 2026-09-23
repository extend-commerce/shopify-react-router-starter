# Development Practices

This document outlines the development practices and conventions that should be followed when working on the Shopify React Router Starter.

## Code Style and Formatting

We use [Prettier](https://prettier.io/) for automatic code formatting. This ensures a consistent code style across the entire codebase.

- **Check for formatting issues:**

  ```bash
  pnpm run format:check
  ```

- **Format the code:**

  ```bash
  pnpm run format
  ```

We recommend setting up your editor to format on save.

## Linting

We use [ESLint](https://eslint.org/) to identify and report on patterns found in ECMAScript/JavaScript code. Our ESLint configuration is based on the recommended rules from ESLint and TypeScript ESLint.

- **Run the linter:**

  ```bash
  pnpm run lint
  ```

## Type Checking

We use [TypeScript](https://www.typescriptlang.org/) for static type checking. This helps us catch errors early and improve code quality.

- **Run the type checker:**

  ```bash
  pnpm run typecheck
  ```

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. This helps us maintain a clear and consistent commit history, and allows us to automatically generate changelogs.

To make it easier to follow the specification, we use [Commitizen](http://commitizen.github.io/cz-cli/) to create commit messages.

- **Create a commit:**

  ```bash
  pnpm run commit
  ```

This will launch an interactive prompt that will guide you through creating a compliant commit message.
