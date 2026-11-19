import { describe, it } from 'node:test';
import assert from 'node:assert';
import { gridToCsv, parseCsvToGrid, parseCsvRecords, PILOT_CSV_HEADER } from './pilot-csv.ts';

const SAMPLE = [
  PILOT_CSV_HEADER,
  'Colombo,Thimbirigasyaya,514A,Kirulapone,Nimal Perera,+94771234567,nimal@example.com,Sunil Jayakody,2,15',
  'Gampaha,Kelaniya,123,Peliyagoda,Kamal Fernando,+94773456789,kamal@example.com,Anura Kumara,0,10',
].join('\n');

describe('pilot-csv: grid <-> CSV round trip', () => {
  it('keeps secretary_email and max_members_per_team (previously dropped)', () => {
    const rows = parseCsvToGrid(SAMPLE);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].secretaryEmail, 'nimal@example.com');
    assert.strictEqual(rows[0].maxMembersPerTeam, 15);
    const csv = gridToCsv(rows);
    assert.ok(csv.includes('nimal@example.com'));
    assert.ok(csv.split('\n')[1].endsWith(',2,15'));
  });

  it('round-trips unchanged', () => {
    const again = gridToCsv(parseCsvToGrid(SAMPLE));
    assert.strictEqual(again, SAMPLE);
  });

  it('defaults email to empty and max members to 10 for rows built in the grid', () => {
    const csv = gridToCsv([
      { id: 'a', district: 'Colombo', dsDivision: 'X', gnNumber: '1', gnName: 'Y', secretaryName: '', secretaryContact: '', sdoName: '', initialTeams: 0 },
    ]);
    assert.strictEqual(csv.split('\n')[1], 'Colombo,X,1,Y,,,,,0,10');
  });
});

describe('pilot-csv: parsing', () => {
  it('strips a UTF-8 BOM and handles CRLF', () => {
    const rows = parseCsvToGrid('\uFEFF' + SAMPLE.replace(/\n/g, '\r\n'));
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[1].gnName, 'Peliyagoda');
  });

  it('matches flexible header names and any column order', () => {
    const rows = parseCsvToGrid('GN Name,District Name,DS-Division,GN No,Teams\nPamankada,Colombo,Thimbirigasyaya,514B,3');
    assert.strictEqual(rows[0].district, 'Colombo');
    assert.strictEqual(rows[0].gnNumber, '514B');
    assert.strictEqual(rows[0].gnName, 'Pamankada');
    assert.strictEqual(rows[0].initialTeams, 3);
  });

  it('does not swallow the first data row of a header-less file', () => {
    const rows = parseCsvToGrid('Colombo,Thimbirigasyaya,514A,Kirulapone\nGampaha,Kelaniya,123,Peliyagoda');
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].district, 'Colombo');
  });

  it('keeps quoted commas, doubled quotes and line breaks inside a field', () => {
    const csv = `${PILOT_CSV_HEADER}\nColombo,"Dehiwala, Mount Lavinia",9,"Say ""Hi""\nline2",,,,,1,10`;
    const rows = parseCsvToGrid(csv);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].dsDivision, 'Dehiwala, Mount Lavinia');
    assert.strictEqual(rows[0].gnName, 'Say "Hi"\nline2');
    // Output never contains a raw line break inside a field (the API splits lines before quotes).
    const out = gridToCsv(rows);
    assert.strictEqual(out.split('\n').length, 2);
    assert.strictEqual(parseCsvToGrid(out)[0].gnName, 'Say "Hi" line2');
  });

  it('skips blank and # comment lines, returns [] for header-only or empty input', () => {
    assert.strictEqual(parseCsvToGrid(`# note\n\n${SAMPLE}\n\n`).length, 2);
    assert.deepStrictEqual(parseCsvToGrid(PILOT_CSV_HEADER), []);
    assert.deepStrictEqual(parseCsvToGrid(''), []);
    assert.deepStrictEqual(parseCsvRecords('\n\n'), []);
  });

  it('understands the same header aliases as the API', () => {
    const rows = parseCsvToGrid(
      'Divisional Secretariat,GN Code,District Name,Grgrama_niladhari_x,Grama Niladhari,Secretary Phone,Number of Teams,Team Limit\n' +
      'Thimbirigasyaya,514A,Colombo,ignored,Kirulapone,0771234567,4,25',
    );
    assert.strictEqual(rows[0].district, 'Colombo');
    assert.strictEqual(rows[0].dsDivision, 'Thimbirigasyaya');
    assert.strictEqual(rows[0].gnNumber, '514A');
    assert.strictEqual(rows[0].gnName, 'Kirulapone');
    assert.strictEqual(rows[0].secretaryContact, '0771234567');
    assert.strictEqual(rows[0].initialTeams, 4);
    assert.strictEqual(rows[0].maxMembersPerTeam, 25);
  });

  it('falls back to 0 teams / 10 members for non-numeric cells', () => {
    const rows = parseCsvToGrid(`${PILOT_CSV_HEADER}\nColombo,X,1,Y,,,,,abc,`);
    assert.strictEqual(rows[0].initialTeams, 0);
    assert.strictEqual(rows[0].maxMembersPerTeam, 10);
  });
});
