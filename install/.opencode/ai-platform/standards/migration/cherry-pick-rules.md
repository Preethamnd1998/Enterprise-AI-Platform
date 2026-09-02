# Cherry Pick Rules

## Purpose

This document defines how cherry-picks must be performed in Lifetrenz projects.

Cherry-picking is allowed only when functionality completeness can be guaranteed.

---

# Core Rules

Never:

* Raw cherry-pick merge commits
* Cherry-pick without analysis
* Cherry-pick formatting-only commits
* Cherry-pick partial functionality

Always:

* Compute merge-base
* Build semantic patches
* Detect partial migrations
* Validate dependencies

These rules come directly from the Semantic Git standards.

---

# Before Cherry Pick

Identify:

* Feature
* Issue ID
* Source Branch
* Target Branch
* Related Commits

Build dependency map.

---

# Semantic Cherry Pick Process

```text
Commit
    â†“
Semantic Diff
    â†“
Dependency Analysis
    â†“
Migration Plan
    â†“
Cherry Pick
    â†“
Completeness Validation
    â†“
Regression Validation
```

---

# Mandatory Dependency Checks

Verify:

* Controller changes
* Service changes
* Repository changes
* DTO changes
* Mapper changes
* Entity changes
* Enum changes
* Constants changes
* UI changes
* Route changes
* SQL changes
* Flyway changes
* Tests

---

# Partial Migration Detection

Detect when:

```text
Service moved

DTO missing
```

or

```text
UI moved

API missing
```

or

```text
Repository moved

Flyway missing
```

If detected:

```text
Cherry Pick FAILED
```

---

# Migration Agent Validation

Every cherry-pick must pass:

1. Semantic Diff Analysis
2. Dependency Mapping
3. Completeness Validation
4. Regression Validation

---

# Success Criteria

Cherry-pick succeeds only when:

* Functionality works completely
* No missing dependencies
* No compilation failures
* No broken routes
* No broken APIs
* No missing migrations

---

# Lifetrenz Standard

Move functionality.

Do not move commits blindly.

Functionality completeness is more important than commit completeness.

