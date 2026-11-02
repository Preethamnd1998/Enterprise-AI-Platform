// ===== ipd-clinical-service (Mongo): com.lifetrenz.lths.ipd_clinical.audit.Auditable =====
// Annotation goes on the controller method. Everything else is derived by AuditAspect.

@PostMapping("__PATH__")
@Auditable(action = "ADD___ENTITY__", module = "__MODULE__", actionFromField = "eventIdentifier")   // actionFromField optional
public ResponseEntity<?> add(@RequestHeader HttpHeaders headers, @RequestBody __Entity__Event body) { ... }

@PutMapping("__PATH__/{id}")
@Auditable(action = "UPDATE___ENTITY__", module = "__MODULE__")
public ResponseEntity<?> update(@RequestHeader HttpHeaders headers, @PathVariable String id, @RequestBody __Entity__Event body) { ... }

@DeleteMapping("__PATH__/{id}")
@Auditable(action = "DELETE___ENTITY__", module = "__MODULE__")
public ResponseEntity<?> delete(@RequestHeader HttpHeaders headers, @PathVariable String id, @RequestBody(required = false) DeleteInfo info) { ... }

// Contract the history code relies on (keep stable in DTOs):
//  - Response body returns the event DTO with:  id, eventAction (ADD | UPDATE | DELETE), patientId, encounterId
//  - Request body carries patientId / encounterId (aspect extracts patientName + mpi from it)
//  - DELETE: response body must contain the deleted event (request body may be empty); deleteInfo{reason, remarks}
//  - UPDATE/DELETE: record id as path variable named `id` (history reads requestParams.id)
//  - No secrets / documents / base64 payloads in the body (stored verbatim, cap 500 000 chars)

// ===== Read side (AuditServiceImpl) — add a mapper only if the generic one is not enough =====
// Generic:  GET /audit/logs/clinical-history?module=__MODULE__&patientId=..&customerBusinessId=..&siteId=..[&encounterId=..&fromDate=<epochMs>&toDate=<epochMs>]
//           -> GenericClinicalAuditDTO (flat; clinical data flattened to root by @JsonAnyGetter)
// Module-specific: copy mapToAllergyAuditDTO: eventAction <- responseBody.eventAction; entity id <- requestParams.id | responseBody.id;
//           data <- requestBody if present else responseBody; always try/catch each JSON parse (legacy rows may be toString()).
// Date filters are EPOCH MILLIS (UTC instants).  timestamp is a java.util.Date (BSON UTC).
