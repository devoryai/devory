# Database Standard

## Purpose

This document defines the database design and data management standards for projects.

The goal is to ensure that database schemas remain:

- understandable
- consistent
- safe to modify
- performant enough for real workloads

Database design should favor **clarity, integrity, and maintainability** over cleverness or unnecessary complexity.

---

# Core Philosophy

The database is the system's **source of truth**.

Schema design should prioritize:

- data integrity
- clarity
- long-term maintainability

Poor database design is extremely difficult to fix later, so careful structure is important.

---

# Prefer Clear and Predictable Schemas

Tables should represent **clear domain concepts**.

Examples:

- users
- organizations
- events
- service_plans
- songs

Avoid vague or overloaded tables.

Every table should have a clear responsibility.

---

# Naming Conventions

Tables should use **snake_case plural nouns**.

Examples:
users
organizations
events
service_plans


Columns should also use **snake_case**.

Examples:
user_id
created_at
updated_at
event_date
organization_id


Consistency is critical.

---

# Primary Keys

All tables should include a primary key.

Preferred format:
id UUID PRIMARY KEY


UUIDs are preferred for distributed systems and safer external references.

Avoid relying on sequential IDs when external exposure is possible.

---

# Foreign Keys

Relationships between tables should use explicit foreign keys.

Example:
organization_id UUID REFERENCES organizations(id)


Foreign keys enforce data integrity and prevent orphaned records.

Avoid implicit relationships.

---

# Timestamps

All tables should include the following timestamps where applicable:
created_at
updated_at


These fields should be automatically managed by the system.

Timestamps improve traceability and debugging.

---

# Soft Deletes

When appropriate, prefer **soft deletes** over hard deletes.

Example:
deleted_at TIMESTAMP NULL


Soft deletes allow recovery and auditing.

Hard deletes should only be used when data removal is required.

---

# Avoid Over-Normalization

Normalization improves consistency but excessive normalization increases complexity.

Balance normalization with practical usability.

Avoid designs that require excessive joins for common operations.

---

# Avoid Excessive JSON Columns

JSON columns can be useful but should not replace structured schema design.

Use JSON fields only when:

- the structure is highly variable
- the data is not frequently queried

Core system data should use structured columns.

---

# Indexing

Indexes should be added for:

- foreign keys
- frequently filtered columns
- frequently joined columns

Indexes improve query performance but should not be added excessively.

---

# Migration Discipline

Database changes must always use **migrations**.

Schema changes should never be applied manually in production environments.

Migrations should include:

- forward migration
- rollback plan if possible

Migration history should be preserved.

---

# Data Integrity

Data integrity must be enforced at the database level when possible.

Examples:

- NOT NULL constraints
- foreign keys
- check constraints
- unique constraints

Application logic should not be the only layer enforcing data integrity.

---

# Avoid Dangerous Operations

Avoid schema changes that could:

- delete large amounts of data
- break existing relationships
- lock large tables

Schema changes should be planned and tested carefully.

---

# Query Clarity

Queries should prioritize readability and maintainability.

Avoid extremely complex queries that are difficult to understand.

Prefer clear queries over overly clever optimizations.

---

# Auditing

Where appropriate, systems should track important changes.

Examples include:

- changes to service plans
- membership updates
- administrative actions

Audit logs improve traceability and accountability.

---

# Multi-Tenant Safety

These systems often support multiple organizations.

Data must always be scoped correctly.

Queries should always ensure that:

- data is filtered by organization
- cross-organization data access is prevented

Tenant isolation is critical for data safety.

---

# Final Rule

Database schemas should be designed so that future engineers can easily understand:

- what the data represents
- how tables relate
- how the data evolves over time

Clarity and integrity are more valuable than clever schema designs.
