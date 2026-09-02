# BE â€” DTO, Mapper & Enum Instructions

> Also read: `coding-standards/STANDARDS.md`.

---

## DTOs

Split every concept into **two DTOs**: one for incoming requests (POST/PUT) and one for outgoing responses (GET).

```java
// Request DTO â€” data coming IN from the client
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RuleAssignmentPostDTO {
    private Long siteId;
    private Long ruleId;
    private String notes;
    private RuleAssignmentStatus status;   // use enums, not raw Strings
}

// Response DTO â€” data going OUT to the client
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RuleAssignmentGetDTO {
    private Long id;
    private Long siteId;
    private Long ruleId;
    private String notes;
    private RuleAssignmentStatus status;
    private String createdBy;
    private Instant createdAt;
}
```

### DTO Rules
- Use `PostDTO` / `GetDTO` naming suffixes consistently.
- Enums must be used for status/type fields â€” never raw Strings.
- DTOs must be pure data containers â€” no logic, no annotations other than Lombok and Jackson.
- Use `@JsonIgnoreProperties(ignoreUnknown = true)` on POST DTOs to tolerate extra fields.

---

## Enums

Place enums in a dedicated `enums/` package within the module:

```java
package com.lifetrenz.ipd.rule.enums;

public enum RuleAssignmentStatus {
    ACTIVE,
    INACTIVE,
    PENDING_APPROVAL;
}
```

### Enum Rules
- Names: `UPPER_SNAKE_CASE` values, `PascalCase` class.
- Never expose magic string literals in service/controller where an enum could be used.
- For Kafka message types, define a separate `EventType` enum.

---

## Mapper

Each feature module gets one mapper class. Use static methods â€” no Spring bean needed.

```java
public class RuleAssignmentMapper {

    private RuleAssignmentMapper() {}   // utility class â€” no instances

    public static RuleAssignmentGetDTO toGetDTO(IpdAutoFollowUpRuleAssignment entity) {
        if (entity == null) return null;
        return RuleAssignmentGetDTO.builder()
                .id(entity.getId())
                .siteId(entity.getSiteId())
                .ruleId(entity.getRuleId())
                .notes(entity.getNotes())
                .status(entity.getStatus())
                .createdBy(entity.getCustomerTransactionAttribute().getCreatedBy())
                .createdAt(entity.getCustomerTransactionAttribute().getCreatedOn())
                .build();
    }

    public static IpdAutoFollowUpRuleAssignment toEntity(
            RuleAssignmentPostDTO dto, CustomerTransactionAttribute cta) {
        return IpdAutoFollowUpRuleAssignment.builder()
                .siteId(dto.getSiteId())
                .ruleId(dto.getRuleId())
                .notes(dto.getNotes())
                .status(dto.getStatus())
                .active(true)
                .customerTransactionAttribute(cta)
                .build();
    }
}
```

### Mapper Rules
- Static utility class â€” private constructor, all `public static` methods.
- `toEntity()` always accepts a `CustomerTransactionAttribute cta` parameter.
- `toGetDTO()` must handle `null` entity gracefully (return null).
- No business logic in mappers â€” only field mapping.
- Do not use reflection-based mappers (MapStruct, ModelMapper) unless already in the project â€” use explicit field mapping for clarity.

---

## Package Layout (per module)

```
com.lifetrenz.ipd.rule/
â”œâ”€â”€ controller/     AutoFollowUpRuleController.java
â”œâ”€â”€ service/        AutoFollowUpRuleCheckingService.java (interface)
â”œâ”€â”€ service/impl/   AutoFollowUpRuleCheckingServiceImpl.java
â”œâ”€â”€ repository/     IAutoFollowUpRuleAssignmentRepository.java
â”œâ”€â”€ entity/         IpdAutoFollowUpRuleAssignment.java
â”œâ”€â”€ dto/            RuleAssignmentPostDTO.java
â”‚                   RuleAssignmentGetDTO.java
â”œâ”€â”€ mapper/         RuleAssignmentMapper.java
â””â”€â”€ enums/          RuleAssignmentStatus.java
```
