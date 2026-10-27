const fs = require('fs');
const path = require('path');

/**
 * GRS Traceability & 5-Layer Field Coverage Validator (M1.9)
 *
 * Verifies that EVERY field defined in docs/traceability.csv exists across:
 * 1. Database Schema (apps/api/prisma/schema.prisma)
 * 2. API DTO Properties (apps/api/src/.../dto/*.dto.ts)
 * 3. Flutter Dart Models (packages/grs_core/lib/src/models/*.dart)
 * 4. UI Form Widgets (packages/grs_ui/lib/src/widgets/form_widgets.dart)
 * 5. Excel/Export Column Definitions (apps/api/src/jobs/export-job.service.ts)
 *
 * Exits with non-zero code if ANY field is missing in ANY layer.
 */

function parseCsv(content) {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const regex = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
    const matches = [];
    let match;

    while ((match = regex.exec(line)) !== null) {
      matches.push(match[1] !== undefined ? match[1] : match[2]);
    }

    if (matches.length >= 11) {
      rows.push({
        source: matches[0],
        fieldName: matches[1],
        tableName: matches[2],
        columnName: matches[3],
        type: matches[4],
        required: matches[5] === 'true',
        isPrevisit: matches[6] === 'true',
        dtoProperty: matches[7],
        dartProperty: matches[8],
        formWidget: matches[9],
        exportColumn: matches[10],
      });
    }
  }

  return rows;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const csvPath = path.join(rootDir, 'docs/traceability.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: Traceability file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(csvContent);
  console.log(`Loaded ${rows.length} fields from docs/traceability.csv`);

  // 1. Load Prisma Schema
  const prismaSchema = fs.readFileSync(
    path.join(rootDir, 'apps/api/prisma/schema.prisma'),
    'utf-8',
  );

  // 2. Load API DTOs
  const clientDto = fs.readFileSync(
    path.join(rootDir, 'apps/api/src/clients/dto/client.dto.ts'),
    'utf-8',
  );
  const householdDto = fs.readFileSync(
    path.join(rootDir, 'apps/api/src/households/dto/household.dto.ts'),
    'utf-8',
  );
  const areaDto = fs.readFileSync(
    path.join(rootDir, 'apps/api/src/areas/dto/area.dto.ts'),
    'utf-8',
  );

  // 3. Load Dart Models
  const dartClient = fs.readFileSync(
    path.join(rootDir, 'packages/grs_core/lib/src/models/client.dart'),
    'utf-8',
  );
  const dartHousehold = fs.readFileSync(
    path.join(rootDir, 'packages/grs_core/lib/src/models/household.dart'),
    'utf-8',
  );
  const dartArea = fs.readFileSync(
    path.join(rootDir, 'packages/grs_core/lib/src/models/area.dart'),
    'utf-8',
  );

  // 4. Load Form Widgets
  const formWidgets = fs.readFileSync(
    path.join(rootDir, 'packages/grs_ui/lib/src/widgets/form_widgets.dart'),
    'utf-8',
  );

  // 5. Load Export Columns
  const exportService = fs.readFileSync(
    path.join(rootDir, 'apps/api/src/jobs/export-job.service.ts'),
    'utf-8',
  );

  const errors = [];

  for (const row of rows) {
    const fieldIdentifier = `[${row.tableName}.${row.columnName} / ${row.fieldName}]`;

    // Layer 1: Database Column in Prisma Schema
    const hasDbColumn =
      prismaSchema.includes(`@map("${row.columnName}")`) ||
      prismaSchema.includes(` ${row.columnName} `) ||
      prismaSchema.includes(`\n  ${row.columnName} `);

    if (!hasDbColumn) {
      errors.push(`${fieldIdentifier} Missing Database Column in schema.prisma: '${row.columnName}'`);
    }

    // Layer 2: API DTO Property
    let dtoContent = '';
    if (row.tableName === 'clients') dtoContent = clientDto;
    else if (row.tableName === 'households') dtoContent = householdDto;
    else if (row.tableName === 'divisional_secretariats' || row.tableName === 'gn_divisions') {
      dtoContent = areaDto;
    }

    const hasDtoProp =
      dtoContent.includes(`${row.dtoProperty}:`) ||
      dtoContent.includes(`${row.dtoProperty}?:`);

    if (!hasDtoProp) {
      errors.push(`${fieldIdentifier} Missing DTO property in API DTOs: '${row.dtoProperty}'`);
    }

    // Layer 3: Dart Model Property
    let dartContent = '';
    if (row.tableName === 'clients') dartContent = dartClient;
    else if (row.tableName === 'households') dartContent = dartHousehold;
    else if (row.tableName === 'divisional_secretariats' || row.tableName === 'gn_divisions') {
      dartContent = dartArea;
    }

    const hasDartProp =
      dartContent.includes(` ${row.dartProperty};`) ||
      dartContent.includes(`this.${row.dartProperty}`);

    if (!hasDartProp) {
      errors.push(`${fieldIdentifier} Missing Dart model property in grs_core: '${row.dartProperty}'`);
    }

    // Layer 4: Form Widget in UI Registry
    const hasFormWidget = formWidgets.includes(`'${row.formWidget}'`);
    if (!hasFormWidget) {
      errors.push(`${fieldIdentifier} Missing Form Widget in grs_ui registry: '${row.formWidget}'`);
    }

    // Layer 5: Excel / Export Column
    const hasExportCol =
      exportService.includes(`${row.exportColumn}:`) ||
      exportService.includes(`'${row.exportColumn}'`) ||
      exportService.includes(`"${row.exportColumn}"`);

    if (!hasExportCol) {
      errors.push(`${fieldIdentifier} Missing Export Column in export-job.service: '${row.exportColumn}'`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Traceability Coverage FAILED with ${errors.length} errors:`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ TRACEABILITY 100% COVERAGE PASSED: All ${rows.length} fields fully traced across 5 layers!`);
  console.log('   - Layer 1 Database Schema (schema.prisma): OK');
  console.log('   - Layer 2 API DTOs (apps/api): OK');
  console.log('   - Layer 3 Dart Models (grs_core): OK');
  console.log('   - Layer 4 Form Widgets (grs_ui): OK');
  console.log('   - Layer 5 Export Columns (export-job.service): OK');
}

main();
