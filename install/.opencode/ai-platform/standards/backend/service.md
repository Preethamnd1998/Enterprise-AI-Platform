# BE â€” Service & ServiceImpl Instructions

> Also read: `coding-standards/STANDARDS.md` before writing any service.

---

## Structure

Every service consists of two files:

```
AutoFollowUpRuleCheckingService.java        â† interface (public API contract)
AutoFollowUpRuleCheckingServiceImpl.java    â† implementation
```

The interface defines the public contract. The impl contains all logic.

---

## Service Interface Template

```java
package com.lifetrenz.ipd.rule.service;

/**
 * Manages auto follow-up rule assignment and evaluation for a given site.
 */
public interface AutoFollowUpRuleCheckingService {

    /**
     * Returns all active rule assignments for the site, paginated.
     */
    List<RuleAssignmentGetDTO> getRules(CustomerTransactionAttribute cta, Long siteId, Pageable pageable);

    /**
     * Assigns a rule to the site. Throws {@link ApplicationException} if already assigned.
     */
    RuleAssignmentGetDTO assignRule(CustomerTransactionAttribute cta, Long siteId, RuleAssignmentPostDTO dto);

    /**
     * Soft-deletes the assignment. Throws {@link ApplicationException} if not found.
     */
    void removeRule(CustomerTransactionAttribute cta, Long siteId, Long assignmentId);
}
```

---

## ServiceImpl Template

```java
@Service
@Slf4j
public class AutoFollowUpRuleCheckingServiceImpl implements AutoFollowUpRuleCheckingService {

    @Autowired
    private IAutoFollowUpRuleAssignmentRepository ruleRepository;   // own repo ONLY

    // -------------------------------------------------------------------------

    @Override
    public List<RuleAssignmentGetDTO> getRules(CustomerTransactionAttribute cta,
                                               Long siteId, Pageable pageable) {
        log.info("Fetching rules for siteId={}", siteId);
        List<IpdAutoFollowUpRuleAssignment> entities = ruleRepository.findBySiteId(siteId, pageable);
        return entities.stream().map(RuleAssignmentMapper::toGetDTO).collect(Collectors.toList());
    }

    @Override
    public RuleAssignmentGetDTO assignRule(CustomerTransactionAttribute cta,
                                           Long siteId, RuleAssignmentPostDTO dto) {
        log.info("Assigning rule ruleId={} to siteId={}", dto.getRuleId(), siteId);
        validateNoDuplicate(siteId, dto.getRuleId());
        IpdAutoFollowUpRuleAssignment entity = RuleAssignmentMapper.toEntity(dto, cta);
        IpdAutoFollowUpRuleAssignment saved = ruleRepository.save(entity);
        log.info("Rule assigned successfully assignmentId={}", saved.getId());
        return RuleAssignmentMapper.toGetDTO(saved);
    }

    @Override
    public void removeRule(CustomerTransactionAttribute cta, Long siteId, Long assignmentId) {
        log.info("Removing assignmentId={} for siteId={}", assignmentId, siteId);
        IpdAutoFollowUpRuleAssignment existing = findOrThrow(siteId, assignmentId);
        ruleRepository.delete(existing);  // triggers @SQLDelete soft-delete
        log.info("Assignment soft-deleted assignmentId={}", assignmentId);
    }

    // -------------------------------------------------------------------------
    // Private helpers

    private void validateNoDuplicate(Long siteId, Long ruleId) {
        if (ruleRepository.existsBySiteIdAndRuleId(siteId, ruleId)) {
            throw new ApplicationException(HttpStatus.CONFLICT.value(),
                    "Rule already assigned to this site");
        }
    }

    private IpdAutoFollowUpRuleAssignment findOrThrow(Long siteId, Long assignmentId) {
        return ruleRepository.findByIdAndSiteId(assignmentId, siteId)
                .orElseThrow(() -> new ApplicationException(HttpStatus.NOT_FOUND.value(),
                        "Assignment not found for siteId=" + siteId));
    }
}
```

---

## Rules

- Services must use **only their own repository**. Never inject or call another module's repository.
- All methods receive a `CustomerTransactionAttribute cta` for audit/context propagation.
- Throw `ApplicationException` for business errors â€” never raw `RuntimeException`.
- Keep methods focused (one responsibility per method, â‰¤150 lines â€” see `coding-standards/STANDARDS.md`).
- Log at `INFO` on entry to significant public methods; `DEBUG` inside loops.
- Use Lombok: `@Slf4j`, `@Service`. Use `@Autowired` for field injection per project convention.
- `@Agent` annotation: apply to methods that initiate domain changes so the AOP aspect enriches the CTA.

```java
@Agent(name = "RULE_ENGINE")
public RuleAssignmentGetDTO assignRule(...) { ... }
```

---

## Common ApiService (cross-cutting shared service)

For microservice-to-microservice calls, use a shared `CommonApiService` (or equivalent) that wraps `RestTemplate` / `WebClient` and handles auth headers and error mapping. Example:

```java
@Service
@Slf4j
public class CommonApiService {

    @Autowired
    private RestTemplate restTemplate;

    public <T> T get(String url, Class<T> responseType, HttpHeaders headers) {
        log.debug("GET {}", url);
        HttpEntity<?> entity = new HttpEntity<>(headers);
        ResponseEntity<T> response = restTemplate.exchange(url, HttpMethod.GET, entity, responseType);
        return response.getBody();
    }
}
```

Use this when a service needs data from another microservice â€” never call another module's repository directly.
