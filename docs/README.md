# Shopify React Router Starter

It is built with React Router, TypeScript, and Vite, and uses Drizzle ORM for database management.

## Table of Contents

- [Getting Started](./getting-started.md)
- [Development Practices](./development-practices.md)
- [Environment Variables](./environment-variables.md)
- [Database](./database.md): the `session`, `shop` and `gdpr_request` tables and the install lifecycle
- [Webhooks](./webhooks.md): subscriptions, Shop lifecycle topics and mandatory compliance (GDPR) handling
- [Deployment](./deployment.md)

## Roadmap
- [X] Migrate from docker containerized setup to cloudflare
- [X] Add shop lifecycle webhooks and gdpr events support
- [X] Add Featurebase for customer support
- [ ] Add Posthog for analytics
- [ ] Add cloudflare queues for complex operations with retries
- [ ] Add support for shopify bulk query mechanism
- [ ] Implement effect.ts for scalable architecture
