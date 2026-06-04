# Branch Migration Standards

## Purpose

This document defines how functionality must be migrated between branches in Lifetrenz applications.

The goal is to move complete functionality safely without introducing regressions, duplicate logic, missing dependencies, or incomplete implementations.

---

# Migration Principles

Never migrate files blindly.

Always migrate functionality.

Focus on:

* Feature completeness
* Dependency completeness
* Build safety
* Backward compatibility

---

# Migration Workflow

```text
Source Branch
    ↓
Merge Base Analysis
    ↓
Semantic Diff Analysis
    ↓
Dependency Analysis
    ↓
Migration Plan
    ↓
Code Migration
    ↓
Completeness Validation
    ↓
Regression Validation
    ↓
Target Branch
```

---

# Required Analysis

Before migration:

Always identify:

* Controllers
* Services
* ServiceImpl
* Repositories
* DTOs
* Mappers
* Entities
* Enums
* Constants
* Validators
* SQL
* Flyway
* Angular Components
* Routes
* Permissions
* Tests

---

# Semantic Diff Rules

Always:

* Compute merge-base
* Compare functionality
* Detect dependency changes
* Detect partial migrations

Never:

* Compare files only
* Compare formatting changes
* Ignore dependencies

---

# Dependency Mapping

Every migration must build a dependency map.

Example:

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
Entity
```

or

```text
Angular Component
    ↓
Service
    ↓
API
    ↓
Controller
```

Migration is incomplete until all dependencies are migrated.

---

# Functionality Completeness Validation

Before migration succeeds verify:

* Controller
* Service
* Repository
* DTO
* Mapper
* Entity
* Enum
* Validation
* Constants
* UI
* Route
* SQL
* Flyway
* Tests
* Translation
* Permissions

If any dependency is missing:

```text
Migration FAILED
```

---

# Regression Validation

After migration verify:

* Build passes
* Unit tests pass
* API contract preserved
* Database contract preserved
* Existing workflows preserved

---

# Prohibited

Never:

* Move code without dependency analysis
* Migrate formatting-only changes
* Ignore Flyway dependencies
* Ignore UI dependencies
* Ignore permission changes
* Ignore translations

---

# Lifetrenz Rule

Always migrate complete functionality.

Never migrate individual files in isolation.
