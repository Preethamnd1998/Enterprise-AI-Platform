# Large Excel / Data Import Testing

Grounded in the verified `data-import` flow
(`Knowledge Repo/docs/Custom Flow knowledge/uplaod/RCM-New-Upload-Knowledge.md`).
Confirmed real mechanics from that flow — use these as the reference architecture
for testing *any* large-import feature in this codebase, and verify against the
target feature's own implementation before assuming parity:

- **Streaming parse for large files**: `.xlsx` uses a hand-written SAX streaming
  reader specifically to avoid loading the whole workbook into heap — documented
  perf gain "cuts parse time from ~30s to ~3s for 50K rows." `.xls` (legacy) still
  loads fully in-memory via `HSSFWorkbook` — "legacy format, smaller files
  expected" is an explicit, documented assumption, not an oversight.
- **Configurable batch size**: `@Value("${data.import.batch.size:500}")`, default
  500 rows per batch.
- **Async execution with polling**: `processImportAsync` (`@Async`); status is
  polled, not pushed — `getImportStatus`.
- **Two-tier validation before any write**: cheap per-cell type checks, then one
  batch DB-duplicate check — both complete during "validate" before "execute"
  writes anything.
- **Batch failure isolation**: `DataIntegrityViolationException` during
  `processBatch` triggers `handleBatchSaveFailure` — a **row-by-row retry within
  that batch** (so one bad row doesn't fail the whole batch); any other exception
  marks the *whole batch* FAILED, but **other batches are unaffected**.
- **Row disposition policy is "skip," never "reject-whole-file" or "merge"** — a
  bad row is marked failed and skipped; the file as a whole still completes.
- **Known, documented gaps** (RCM doc §39, referenced at multiple points): in-file
  duplicate detection only happens at execute time, not validate time (so
  validate-time and execute-time can disagree); no DB-level unique constraint
  backing the dedupe (app-code only); wizard UI doesn't rehydrate state from
  `importId` on page refresh. **These are documented limitations, not hidden
  bugs — don't write a test asserting the gap must not exist without first
  confirming with the feature owner whether closing it is in scope.**

## Large datasets — what "large" actually tests

Don't just re-run the same small-file test with more rows — that only proves
looping works. Cover what changes qualitatively at scale:

```java
@Test
void largeImport_50kRows_streamingParserUsed_notFullyLoadedInMemory() {
    // proves the streaming path activates for .xlsx, not just that the result is correct
    Path largeFile = generateXlsxFixture(50_000);

    long heapBefore = usedHeapAfterGc();
    ImportResult result = importService.parseFile(largeFile, ".xlsx");
    long heapPeakDuringParse = /* capture via a heap-sampling hook or a documented memory test harness */;

    assertThat(result.getRowCount()).isEqualTo(50_000);
    assertThat(heapPeakDuringParse).isLessThan(fullyLoadedWorkbookHeapEstimate);
}
```

If a true heap-usage assertion is impractical in CI, a reasonable substitute is a
**wall-clock regression guard** (loose bound, not a tight SLA — see
[java-performance-load-testing.md](java-performance-load-testing.md)): assert
50K-row parse completes well under the full-in-memory equivalent's time, to catch
an accidental regression from the streaming path back to a full-load path.

## Memory usage

- For the streaming (`.xlsx`) path: a memory-usage test is about **catching a
  regression back to full in-memory loading**, not proving an absolute number —
  frame the assertion as a comparative/regression guard, not a hard byte count.
- For the full-in-memory (`.xls`) path: the "legacy format, smaller files
  expected" assumption is exactly the kind of documented constraint that needs a
  **boundary test at the assumed safe size**, not an attempt to push it to 50K
  rows (which the implementation was never designed to handle well) — if a real
  need arises to import large `.xls` files, that's a feature gap to raise, not a
  test to force-pass.

## Batch processing test cases

Directly derived from the confirmed `processBatch`/`handleBatchSaveFailure`
mechanics:

```java
@Test
void executeImport_oneBadRowInBatch_retriedRowByRow_othersSucceed() {
    // batch of `data.import.batch.size` rows, one violates a unique constraint
    List<ImportRow> batch = batchWithOneDuplicateKeyRow(batchSize, duplicateAtIndex = 3);

    BatchResult result = importExecutor.processBatch(batch);

    assertThat(result.getSucceededCount()).isEqualTo(batchSize - 1);
    assertThat(result.getFailedRows()).extracting(ImportRow::getIndex).containsExactly(3);
}

@Test
void executeImport_oneBatchThrowsUnexpectedException_onlyThatBatchMarkedFailed() {
    // batch 2 of 3 throws a non-DataIntegrityViolationException
    stubBatchExecution(batchIndex = 2, throwing = new RuntimeException("downstream timeout"));

    ImportJobResult jobResult = importExecutor.execute(threeBatches);

    assertThat(jobResult.getBatchStatus(1)).isEqualTo(BatchStatus.SUCCEEDED);
    assertThat(jobResult.getBatchStatus(2)).isEqualTo(BatchStatus.FAILED);
    assertThat(jobResult.getBatchStatus(3)).isEqualTo(BatchStatus.SUCCEEDED); // isolation proven
}
```

**Boundary values to test against the configurable batch size**: exactly
`batchSize` rows (one full batch, no remainder), `batchSize + 1` (forces a second,
partial batch), `batchSize - 1` (single partial batch only). Since the size is
externally configurable (`data.import.batch.size`), a test hardcoding "500" as a
literal without reading the actual configured value in that test's context will
silently stop testing the real boundary if the config changes — inject/read the
property rather than hardcoding it twice.

## Duplicate records — validate-time vs execute-time (the documented gap)

```java
@Test
void validateAllRows_inFileDuplicates_notCaughtAtValidateTime_documentedGap() {
    // documents the KNOWN gap (RCM doc §39) — this test exists to make the gap
    // visible and intentional, not to silently rely on it. If this test starts
    // failing because someone closed the gap, that's a welcome change — update
    // this test to assert the new (better) behavior instead of reverting the fix.
    List<ImportRow> rowsWithInFileDuplicate = twoRowsSameCompositeKey();

    ValidationResult validation = importService.validateAllRows(rowsWithInFileDuplicate);

    assertThat(validation.getRowErrors()).isEmpty(); // gap: not caught here
}

@Test
void executeImport_inFileDuplicates_secondOccurrenceSilentlyDropped() {
    List<ImportRow> rowsWithInFileDuplicate = twoRowsSameCompositeKey();

    ImportJobResult result = importService.execute(rowsWithInFileDuplicate);

    assertThat(result.getSucceededCount()).isEqualTo(1); // only first occurrence persisted
}
```

Writing the gap down as an explicit, named test (rather than leaving it
undocumented) turns a silent behavior into a tracked one — anyone changing this
code sees exactly what currently happens and must make a deliberate choice to
change the assertion, not accidentally regress or accidentally "fix" scope no one
asked for.

## Partial failures, transaction behavior, and retry/resume

- **Transaction scope matches batch scope**, not file scope — a test asserting
  "the whole file rolled back because row 40,000 failed" would be testing for
  behavior this system explicitly does not have (and should not have, per the
  skip-not-reject policy). Assert the actual scope: failed rows are skipped,
  the batch/file otherwise completes.
- **Retry/resume**: since execution is async and polled (`processImportAsync` +
  `getImportStatus`), a resume-after-crash test needs to verify state is
  recoverable from the persisted job/row state (`data_import_job`,
  `data_import_row` — see RCM doc §34's ERD), not from in-memory state that a
  server restart would lose. If `cancelImport` exists, test that a cancelled job
  stops processing further batches but doesn't roll back already-committed ones
  (consistent with the batch-isolation model) — confirm this against the actual
  implementation before asserting it, since cancellation semantics for
  already-committed batches should be verified, not assumed.

## Performance considerations specific to import

See [java-performance-load-testing.md](java-performance-load-testing.md) for
general load testing. Import-specific angles:

- Parse time regression guard for the streaming path (above).
- Batch-size sensitivity: does throughput actually improve with a larger
  configured batch size, or does it plateau/regress (e.g., due to larger
  transaction locks)? Worth a one-time exploratory benchmark, not a permanent CI
  assertion (see [test-lifecycle-and-build-isolation.md](test-lifecycle-and-build-isolation.md)
  for how to retire exploratory perf tests safely).
- Async job polling interval vs. actual completion time — a test with a hardcoded
  short timeout waiting on an async job is a common source of flakiness in CI;
  use Awaitility (confirmed available in `inventory-service`) rather than a fixed
  `Thread.sleep` + single check:

```java
await().atMost(Duration.ofSeconds(30))
       .pollInterval(Duration.ofMillis(500))
       .until(() -> importService.getImportStatus(jobId).isTerminal());
```
