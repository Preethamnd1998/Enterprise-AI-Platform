# File Upload Testing — Excel/CSV, Images, PDF, Other

Two verified real upload flows ground this file — use them as reference
implementations rather than generic assumptions:

- **Excel/CSV data import** — `data-import` flow (`rcm-service`/`core-service`,
  fully documented in
  `Knowledge Repo/docs/Custom Flow knowledge/uplaod/RCM-New-Upload-Knowledge.md`,
  its own §32–§33 give a complete file-format spec and validation matrix — read
  that doc directly before writing tests for *that specific* flow; this file gives
  the general technique).
- **Document/attachment upload** — `file-store` service (`ClinicalAttachmentController`,
  `DocumentStorageController`, `FileStoreController`), supporting multipart upload
  and a base64-content path (`DocumentUploadRequest`), with pluggable storage
  backends (S3/Azure/Local). Verified: `max-file-size: 200MB` /
  `max-request-size: 200MB` in `file-store`'s `bootstrap.yml`.

**Don't assume a content-type/extension whitelist exists on a given endpoint** —
it wasn't found on a first pass through `file-store`'s controllers/DTOs; confirm
per-endpoint before writing a test that asserts one is enforced.

## Core file-upload test dimensions (apply to any upload endpoint)

| Dimension | Cases to cover |
|---|---|
| Extension/type | allowed type accepted; disallowed type rejected; case variation (`.XLSX` vs `.xlsx`) if matching is case-sensitive |
| Size | empty file (0 bytes); typical size; at the configured limit; one byte over the limit |
| Corruption | well-formed-looking bytes with wrong/corrupted internal structure (e.g., a `.xlsx` that's actually a renamed `.txt`, or a truncated zip) |
| Filename | missing filename; filename with special characters/path traversal attempt (`../../etc`) |
| Content mismatch | correct extension, wrong actual content (e.g., a `.pdf` extension on a JPEG byte stream) — verify the service checks actual content, not just the extension, if that's the documented contract |
| Duplicate submission | same file uploaded twice — verify the documented dedupe behavior (see Excel-import hash-based dedupe below) |

## Excel/CSV import — grounded in the verified validation matrix

The `data-import` flow's validation matrix (RCM upload doc §33) is the reference
for **exactly which checks are blocking (reject upload) vs. non-blocking (row
marked invalid, upload proceeds)** — don't invent your own severity assumptions;
read the matrix for the specific import type under test. Key confirmed facts to
build test cases from:

- File extension restricted to `.xlsx`/`.xls`/`.csv` (`isValidFileFormat`) —
  blocking.
- Empty file / missing filename — blocking, with specific error messages ("File
  is empty", "File name is missing").
- **Duplicate file detection is SHA-256 hash-based**, scoped to
  `(import type, file hash, customer business id)` — test: same content uploaded
  twice → rejected; same content but different `importIdentifier` or different
  customer → allowed (proves the scoping, not just "any dupe hash rejected").
- Only the **first sheet** is ever read (`.xlsx`/`.xls`/`.csv`) — test that data on
  a second sheet is silently ignored, not an error (this is documented behavior,
  not a bug — assert it stays that way, since a well-meaning "fix" could
  regress a documented, relied-upon limitation).
- Header matching is **exact, case-sensitive** — test a header with different
  casing or trailing whitespace is treated as "column not found," not
  auto-matched.
- Blank cells become `""`, not `null` — a test asserting `null`-handling behavior
  on a blank required cell is testing the wrong thing; assert against `""`.
- Per-cell type validation (number/email/phone/date) is **non-blocking** — a bad
  cell marks that row invalid but doesn't stop the whole file from uploading.
  Test: a file with 1 bad row among 100 good ones completes upload; only the bad
  row is flagged.
- Numeric parsing accepts anything `Double.parseDouble` accepts, including
  scientific notation (`"1.23e2"`) — a boundary test worth having if the target
  field is meant to be a plain integer count, since `"1.23e2"` silently becomes
  `123.0`.

```java
@Test
void uploadFile_duplicateHash_sameImportTypeAndCustomer_rejected() {
    byte[] fileBytes = readTestFixture("catalog-consultation-code-valid.xlsx");
    uploadFile(importIdentifier, fileBytes, customerBusinessId); // first upload succeeds

    ApplicationResponse second = uploadFile(importIdentifier, fileBytes, customerBusinessId);

    assertThat(second.getStatus()).isEqualTo(CommonConstants.FAILED);
    assertThat(second.getMessage()).contains("already been uploaded");
}

@Test
void uploadFile_duplicateHash_differentCustomer_allowed() {
    byte[] fileBytes = readTestFixture("catalog-consultation-code-valid.xlsx");
    uploadFile(importIdentifier, fileBytes, customerA);

    ApplicationResponse second = uploadFile(importIdentifier, fileBytes, customerB);

    assertThat(second.getStatus()).isEqualTo(CommonConstants.SUCCESS); // scoping proven, not just "dupe check exists"
}
```

## Corrupt / invalid file testing

```java
@ParameterizedTest
@MethodSource("corruptFileFixtures")
void uploadFile_corruptOrMismatchedContent_rejectedWithClearError(String fixtureName, String expectedError) {
    byte[] bytes = readTestFixture(fixtureName);

    ApplicationResponse response = uploadFile(importIdentifier, bytes, customerId);

    assertThat(response.getStatus()).isEqualTo(CommonConstants.FAILED);
    assertThat(response.getMessage()).contains(expectedError);
}

static Stream<Arguments> corruptFileFixtures() {
    return Stream.of(
        Arguments.of("renamed-txt-as-xlsx.xlsx", "Only .xlsx, .xls, and .csv files are supported"),
        Arguments.of("truncated.xlsx", "corrupt"), // adapt to the actual thrown message
        Arguments.of("empty.xlsx", "File is empty")
    );
}
```

**Never generate the corrupt-file fixtures with random noise only** — include at
least one *realistic* corruption (a genuinely truncated zip from a failed upload,
a renamed non-Excel file) since real production corruption looks like that, not
like random bytes.

## Images / PDF / other file types (attachment/document upload)

- Verify the configured size boundary (**200MB** confirmed for `file-store`) is
  actually enforced — one test just under, one just at, one just over. A
  container/framework-level limit (`spring.servlet.multipart.max-file-size`)
  typically rejects oversized uploads before your controller code even runs —
  verify what the actual failure mode is (HTTP 413? a caught exception?) rather
  than assuming your service code handles it.
- If both a multipart path and a base64 path exist for the same logical upload
  (confirmed: `file-store` has both), test **both paths** for the same validation
  rules — a check present in the multipart controller but missing in the base64
  path (or vice versa) is a real, easy-to-introduce gap.
- Storage-backend abstraction (`FileStorageStrategy` → S3/Azure/Local
  implementations): test the **service layer's** contract against a mocked
  `FileStorageStrategy` (unit test) — don't require real S3/Azure credentials for
  routine tests. Reserve a real-backend integration test (if one exists/is added)
  for verifying the actual storage adapter, gated so it doesn't run in every build.
- PHI/PII in filenames or file content: per `rules/security.md`, don't use real
  patient documents as test fixtures — use synthetic fixtures that look
  structurally realistic (correct PDF/image headers) without real PHI.

## Size/type/extension validation — decision rules

- **Enforce type checks by actual content signature (magic bytes) when the
  contract requires it**, not filename extension alone — extension-only checks
  are trivially spoofed; test this distinction explicitly if the code claims to
  validate content type.
- **Don't assume the client-side `accept` attribute is a security boundary** — per
  the RCM doc's own validation matrix, the UI's file-extension filter is
  explicitly marked "soft filter"; the backend's `isValidFileFormat` is the real
  gate. Always write the backend-level test even if a UI test also exists.
