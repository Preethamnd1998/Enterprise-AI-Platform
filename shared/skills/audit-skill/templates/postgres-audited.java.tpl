// ===== Controller (core-service style). Package of @Audited differs per service:
//   core-service: com.lifetrenz.lths.core.audit.annotation.Audited
//   ipd-service : com.lifetrenz.lths.ipd.billing.audit.annotation.Audited
// ==========================================================================================
private static final String AUDIT_MODULE      = "__MODULE__";          // e.g. SETTINGS
private static final String AUDIT_ENTITY_NAME = "__ENTITY_LABEL__";    // e.g. Clinical Ownership Rule
private static final String AUDIT_ENTITY_TYPE = "__ENTITY_TYPE__";     // UPPER_SNAKE, shared with the UI query
private static final String OLD_VALUE_FETCHER = "__entity__AuditFetcher";
private static final String OLD_VALUE_FETCH_METHOD = "find__Entity__ById";

// CREATE + UPDATE (POST). Body must carry a non-null `id` on update, else activityType = CREATE.
@PostMapping(value = __API_CONSTANT__)
@LogApiError
@Audited(moduleName = AUDIT_MODULE, entityName = AUDIT_ENTITY_NAME, entityType = AUDIT_ENTITY_TYPE,
		description = "Save __entity label__", entityIdFromRequestBody = "id", entityIdFromResponse = "id"
		/* , captureRequestTimestamp = true   // core only: stamp time on the request thread */)
public ApplicationResponse<__Entity__GetDTO> save(@RequestHeader HttpHeaders headers, @RequestBody __Entity__PostDTO request) {
	try {
		TokenPayload token = tokenService.getTokenPayload(headers);
		return success(service.save(request, token));               // service sets previousValue on update (see below)
	} catch (ApplicationException e) {
		return failed(e);                                            // status ERROR => audited as FAILED
	}
}

// DELETE — old value fetched BEFORE the call
@DeleteMapping(value = __API_BY_ID_CONSTANT__)
@LogApiError
@Audited(moduleName = AUDIT_MODULE, entityName = AUDIT_ENTITY_NAME, entityType = AUDIT_ENTITY_TYPE,
		description = "Delete __entity label__", captureOldValue = true,
		oldValueFetcher = OLD_VALUE_FETCHER, oldValueFetchMethod = OLD_VALUE_FETCH_METHOD,
		entityIdFromPathVariable = "id")
public ApplicationResponse<__Entity__GetDTO> delete(@RequestHeader HttpHeaders headers, @PathVariable("id") Long id) { /* ... */ }

// ===== Service: previousValue pattern (core-service UPDATE has no aspect-level old value) =====
// __Entity__GetDTO previous = request.getId() == null ? null : Mapper.toGetDTO(entityBeforeChange);   // BEFORE apply
// apply(entity, request); saved = persist(entity);
// __Entity__GetDTO result = Mapper.toGetDTO(saved);
// result.setPreviousValue(previous);          // DTO field: private __Entity__GetDTO previousValue;  (null on create)
// return result;

// ===== Old-value fetcher bean: tenant-checked =====
@Component("__entity__AuditFetcher")
@Slf4j
public class __Entity__AuditFetcher {
	@Autowired private __Entity__Service service;
	@Autowired private TokenService tokenService;

	public __Entity__GetDTO find__Entity__ById(Long id) {            // signature must be (Long)
		__Entity__GetDTO row = service.find__Entity__ById(id);
		Long callerBusinessId = currentCustomerBusinessId();           // from the current request's Authorization header
		if (row == null || callerBusinessId == null || !Objects.equals(callerBusinessId, service.findCustomerBusinessId(id))) {
			return null;                                               // never copy another tenant's record into the audit
		}
		return row;
	}
	// currentCustomerBusinessId(): RequestContextHolder -> Authorization header -> tokenService.getTokenPayload(...)
}

// ===== ipd-service extras =====
// Update (PUT/PATCH or POST whose method name contains "update"): captureOldValue = true + oldValueFetcher (captured BEFORE proceed).
// Curated new value:  @Audited(..., enricherBean = "__entity__AuditEnricher")  implements AuditValueEnricher { Object buildAuditValue(Object requestBody, Object controllerResult); }

// ===== Read API (UI) =====
// GET /api/v1/audit/activities/entity/{entityType}?customerBusinessId=..&page=0&size=20   (core; verified; entityType may be a comma list)
//   -> ApplicationResponse<Page<ActivityAuditResponse>>  (UI reads result.data.content)
