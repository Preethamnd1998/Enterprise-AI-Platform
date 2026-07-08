# BE — Entity Instructions

> Also read: `coding-standards/STANDARDS.md`.

---

## Entity Template

```java
@Entity
@Table(name = "ipd_auto_follow_up_rule_assignment")
@SQLDelete(sql = "UPDATE ipd_auto_follow_up_rule_assignment SET active = false WHERE id=?")
@FilterDef(
    name = "ipd_auto_follow_up_rule_assignment_active_filter",
    parameters = @ParamDef(name = "active", type = Boolean.class)
)
@Filter(
    name = "ipd_auto_follow_up_rule_assignment_active_filter",
    condition = "active = true"
)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class IpdAutoFollowUpRuleAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "rule_id", nullable = false)
    private Long ruleId;

    // Audit / transaction attribute — required on ALL entities.
    // CustomerTransactionAttribute already contains `active` and `siteId`;
    // do NOT declare separate `active` or `siteId` fields on the entity.
    @Embedded
    private CustomerTransactionAttribute customerTransactionAttribute;
}
```

---

## Required on Every Entity

| Requirement | Annotation / Field |
|---|---|
| Soft delete (never hard delete) | `@SQLDelete` + `@FilterDef` + `@Filter` |
| Transaction context | `@Embedded CustomerTransactionAttribute` |
| Primary key generation | `@Id @GeneratedValue(strategy = GenerationType.IDENTITY)` |
| Boilerplate reduction | Lombok `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor` |

> **Do NOT add** `@Audited`, `@Builder`, a standalone `active` field, or a standalone `siteId` field to entities.
> - `@Audited` — not used in this project.
> - `@Builder` — conflicts with `@NoArgsConstructor` / `@AllArgsConstructor` in JPA; omit it.
> - `active` field — already managed inside `CustomerTransactionAttribute`; declaring it again causes a duplicate-column mapping error.
> - `siteId` field — already managed inside `CustomerTransactionAttribute`; declaring it again causes a duplicate-column mapping error.

---

## Naming Conventions

- Entity class name: `PascalCase`, matches the feature domain — e.g., `IpdAutoFollowUpRuleAssignment`.
- Table name: `snake_case` in `@Table(name = "...")`.
- Column names: `snake_case` in `@Column(name = "...")`.
- Filter name: `<table_name>_active_filter` to avoid collisions across entities.

---

## Rules

- All deletes are **soft deletes** — no `DELETE` statements in production code.
- Always include `CustomerTransactionAttribute` as an `@Embedded` field.
- Do NOT declare `active` on the entity — it lives inside `CustomerTransactionAttribute`.
- Do NOT declare `siteId` on the entity — it lives inside `CustomerTransactionAttribute`.
- Do NOT add `@Audited` — not used in this project.
- Do NOT add `@Builder` — use `@NoArgsConstructor` + `@AllArgsConstructor` only.
- Do NOT add `@Agent` — not applicable to entities.
- Do NOT put business logic in entities — entities are pure data containers.
- Relationships (`@OneToMany`, `@ManyToOne`): use `FetchType.LAZY` by default. Justify `EAGER` in a comment.