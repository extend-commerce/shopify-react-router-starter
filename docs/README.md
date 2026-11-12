# Shopify React Router Starter

It is built with React Router, TypeScript, and Vite, and uses Drizzle ORM for database management.

## Table of Contents

- [Getting Started](./getting-started.md)
- [Development Practices](./development-practices.md)
- [Environment Variables](./environment-variables.md)
- [Database](./database.md): the `session`, `shop` and `gdpr_request` tables and the install lifecycle
- [Webhooks](./webhooks.md): subscriptions, Shop lifecycle topics and mandatory compliance (GDPR) handling
- [Extension API](./api.md): typed tRPC procedures that theme app and customer account extensions call
- [Deployment](./deployment.md)

## Roadmap
- [X] Migrate from docker containerized setup to cloudflare
- [X] Add shop lifecycle webhooks and gdpr events support
- [X] Add Featurebase for customer support
- [X] Add Posthog for analytics
- [ ] Add cloudflare queues/workflows for complex operations with retries (research required)
- [ ] Add support for shopify bulk query mechanism using cloudflare queues/workflows (research required)
- [ ] Implement effect.ts for scalable architecture (research required)
