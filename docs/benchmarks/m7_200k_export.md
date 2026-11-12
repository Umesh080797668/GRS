# M7.1 200,000-Row Streaming Export Benchmark

- **Harness:** `scripts/benchmarks/m7_export_200k_bench.cjs` (isolated ephemeral local `postgres:16-alpine` container)
- **Dataset:** 1 District, 2 DS Divisions, 10 GN Divisions, 40 Teams, 50,000 Households, **200,000 Clients** (47 traceability columns via `EXPORT_COLUMNS_REGISTRY`)
- **Service Under Test:** `ExportJobService` (`createExportForCaller` -> `processExport`) with `ExcelJS.stream.xlsx.WorkbookWriter` writing to temp file and streaming read-back via `ExcelJS.stream.xlsx.WorkbookReader`
- **Build Plan Constraints:** Invariant 8 (UTF-8 NFC Sinhala/Tamil/English headers & labels), Invariant 9 (CSV/Excel formula-injection prefix `'`), Invariant 16 (Keyset cursor streaming; zero SQL `OFFSET`)

## Verified Benchmark Results

| Metric | Observed Result | Status / Constraint |
| :--- | ---: | :--- |
| Exported client rows (`rowCount`) | **200,000** | Exact lossless match |
| Verified streamed XLSX rows (incl. header) | **200,001** | Verified with `WorkbookReader` |
| Keyset cursor batches (`take: 2000`) | **101** | 100 full batches + terminal read |
| SQL `OFFSET` / Prisma `skip` used | **`false`** (0 calls) | Invariant 16 compliant |
| Queue path chosen (`> 5,000` inline cap) | **`worker`** (`queued`) | Handled by standalone worker |
| Total extraction + `.xlsx` write time | **49 s** | Within worker timeout budget |
| Throughput | **4,081 rows/sec** | Sustained DB + XML stream |
| Peak Node heap (`heapUsed`) | **248.47 MB** | Bounded streaming memory |
| Peak process RSS | **536.36 MB** | Safe for dedicated worker |
| Generated `.xlsx` file size | **47.12 MB** | Below 50 MB Free Tier cap |
| Sinhala district header (`si` col 1) | `දිස්ත්‍රික්කය` | Unicode NFC verified |
| Sample sanitized E.164 phone cell | `'+94771234567` | Leading `+` escaped (`'`) |

## Key Engineering Findings

1. **Lossless `id`-Ordered Keyset Cursor:**
   Streaming bulk exports with `(created_at, id)` tuples via JS `Date` parameters caused PostgreSQL `TIMESTAMPTZ(6)` microsecond values to truncate to milliseconds across batch boundaries, inflating a 200,000-row stream to `200,100` duplicated rows. Switching bulk client and duplicate export cursors (`streamClientRows`, `streamDuplicateRows`) strictly to primary-key `id` ascending keyset pagination (`where: { id: { gt: cursorId } }`, `orderBy: { id: 'asc' }`) guarantees **200,000 / 200,000** lossless row parity with zero `OFFSET`.
2. **Formula Injection Defense (Invariant 9):**
   Every exported cell passes through `sanitizeSpreadsheetCell`, which normalizes Unicode to NFC (`String.prototype.normalize('NFC')`) and prepends `'` whenever the trimmed/untrimmed text starts with `=`, `+`, `-`, `@`, `\t`, or `\r`. Confirmed on phone numbers (`+94771234567` -> `'+94771234567`) and injected household/client strings.
3. **Supabase Free Tier 50 MB Storage Ceiling:**
   A 200,000-row × 47-column `.xlsx` workbook produces a **47.12 MB** artifact, close to Supabase Free Tier's 50 MB per-object Storage upload limit. For national-scale extracts exceeding ~200,000 rows, the API and dashboard support `format: "csv"` (streamed UTF-8 with `\uFEFF` BOM), which reduces object size significantly for the same dataset.

