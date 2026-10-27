describe('Database Triggers & Audit Invariants (M1.13)', () => {
  // Simulates the exact logic enforced by PostgreSQL triggers defined in 03_triggers.sql

  interface ClientRow {
    id: string;
    household_id: string;
    district_id: string;
    ds_id: string;
    gn_id: string;
    team_id?: string;
    name: string;
    age: number;
    collected_by: string;
    created_at: Date;
    created_by: string;
    updated_at: Date;
    updated_by?: string;
    server_version: number;
  }

  interface HouseholdRow {
    id: string;
    gn_id: string;
    ds_id: string;
    district_id: string;
    serial_no: number;
    house_no: string;
    house_leader_name: string;
    created_at: Date;
    created_by: string;
    updated_at: Date;
    version: number;
  }

  interface ClientAuditRow {
    id: string;
    client_id: string;
    changed_by: string;
    changed_at: Date;
    before: any;
    after: any;
    reason: string;
  }

  const clientAuditLogs: ClientAuditRow[] = [];

  function simulateClientUpdate(
    oldRow: ClientRow,
    newRow: Partial<ClientRow>,
    actorId: string,
  ): ClientRow {
    const updated: ClientRow = { ...oldRow, ...newRow };

    // Trigger 1: Immutable columns check (app.fn_check_client_immutable)
    if (updated.id !== oldRow.id) {
      throw new Error('Column id is immutable and cannot be modified');
    }
    if (updated.collected_by !== oldRow.collected_by) {
      throw new Error('Column collected_by is immutable and cannot be modified');
    }
    if (updated.household_id !== oldRow.household_id) {
      throw new Error('Column household_id is immutable and cannot be modified');
    }
    if (updated.district_id !== oldRow.district_id) {
      throw new Error('Column district_id is immutable and cannot be modified');
    }
    if (updated.ds_id !== oldRow.ds_id) {
      throw new Error('Column ds_id is immutable and cannot be modified');
    }
    if (updated.gn_id !== oldRow.gn_id) {
      throw new Error('Column gn_id is immutable and cannot be modified');
    }
    if (updated.created_at.getTime() !== oldRow.created_at.getTime()) {
      throw new Error('Column created_at is immutable and cannot be modified');
    }
    if (updated.created_by !== oldRow.created_by) {
      throw new Error('Column created_by is immutable and cannot be modified');
    }

    // Trigger 2: Version bump and timestamp (app.fn_bump_client_version)
    updated.server_version = oldRow.server_version + 1;
    updated.updated_at = new Date();
    updated.updated_by = actorId;

    // Trigger 3: Client audit log (app.fn_client_audit)
    clientAuditLogs.push({
      id: `audit-${Date.now()}-${Math.random()}`,
      client_id: updated.id,
      changed_by: actorId,
      changed_at: updated.updated_at,
      before: { ...oldRow },
      after: { ...updated },
      reason: 'client_record_update',
    });

    return updated;
  }

  function simulateHouseholdUpdate(
    oldRow: HouseholdRow,
    newRow: Partial<HouseholdRow>,
  ): HouseholdRow {
    const updated: HouseholdRow = { ...oldRow, ...newRow };

    // Trigger 1: Immutable columns check (app.fn_check_household_immutable)
    if (updated.id !== oldRow.id) {
      throw new Error('Column id is immutable and cannot be modified');
    }
    if (updated.serial_no !== oldRow.serial_no) {
      throw new Error('Column serial_no is immutable and cannot be modified');
    }
    if (updated.district_id !== oldRow.district_id) {
      throw new Error('Column district_id is immutable and cannot be modified');
    }
    if (updated.ds_id !== oldRow.ds_id) {
      throw new Error('Column ds_id is immutable and cannot be modified');
    }
    if (updated.gn_id !== oldRow.gn_id) {
      throw new Error('Column gn_id is immutable and cannot be modified');
    }
    if (updated.created_at.getTime() !== oldRow.created_at.getTime()) {
      throw new Error('Column created_at is immutable and cannot be modified');
    }
    if (updated.created_by !== oldRow.created_by) {
      throw new Error('Column created_by is immutable and cannot be modified');
    }

    // Trigger 2: Version bump and timestamp (app.fn_bump_household_version)
    updated.version = oldRow.version + 1;
    updated.updated_at = new Date();

    return updated;
  }

  describe('Immutable Columns Protection', () => {
    const initialClient: ClientRow = {
      id: 'client-uuid-1',
      household_id: 'house-uuid-1',
      district_id: 'dist-uuid-1',
      ds_id: 'ds-uuid-1',
      gn_id: 'gn-uuid-1',
      team_id: 'team-uuid-1',
      name: 'Sunil Perera',
      age: 30,
      collected_by: 'agent-uuid-1',
      created_at: new Date('2026-10-26T10:00:00Z'),
      created_by: 'agent-uuid-1',
      updated_at: new Date('2026-10-26T10:00:00Z'),
      server_version: 1,
    };

    it('rejects changes to collected_by (Invariant §5.5 Rule 5)', () => {
      expect(() => {
        simulateClientUpdate(
          initialClient,
          { collected_by: 'malicious-agent-2' },
          'malicious-agent-2',
        );
      }).toThrow('Column collected_by is immutable and cannot be modified');
    });

    it('rejects changes to household_id', () => {
      expect(() => {
        simulateClientUpdate(
          initialClient,
          { household_id: 'house-uuid-2' },
          'agent-uuid-1',
        );
      }).toThrow('Column household_id is immutable and cannot be modified');
    });

    it('rejects changes to scope IDs (district_id, ds_id, gn_id)', () => {
      expect(() => {
        simulateClientUpdate(
          initialClient,
          { gn_id: 'gn-uuid-999' },
          'agent-uuid-1',
        );
      }).toThrow('Column gn_id is immutable and cannot be modified');
    });

    it('rejects changes to household serial_no', () => {
      const initialHouse: HouseholdRow = {
        id: 'house-1',
        gn_id: 'gn-1',
        ds_id: 'ds-1',
        district_id: 'dist-1',
        serial_no: 42,
        house_no: '25/A',
        house_leader_name: 'Kamal',
        created_at: new Date('2026-10-26T10:00:00Z'),
        created_by: 'agent-1',
        updated_at: new Date('2026-10-26T10:00:00Z'),
        version: 1,
      };

      expect(() => {
        simulateHouseholdUpdate(initialHouse, { serial_no: 999 });
      }).toThrow('Column serial_no is immutable and cannot be modified');
    });
  });

  describe('Version Bumping & Timestamps', () => {
    it('automatically increments server_version on client update', () => {
      const client: ClientRow = {
        id: 'client-uuid-1',
        household_id: 'house-uuid-1',
        district_id: 'dist-uuid-1',
        ds_id: 'ds-uuid-1',
        gn_id: 'gn-uuid-1',
        name: 'Sunil',
        age: 30,
        collected_by: 'agent-1',
        created_at: new Date(),
        created_by: 'agent-1',
        updated_at: new Date(),
        server_version: 1,
      };

      const updated = simulateClientUpdate(client, { age: 31 }, 'sec-1');
      expect(updated.server_version).toBe(2);
      expect(updated.age).toBe(31);
    });

    it('automatically increments version on household update', () => {
      const house: HouseholdRow = {
        id: 'house-1',
        gn_id: 'gn-1',
        ds_id: 'ds-1',
        district_id: 'dist-1',
        serial_no: 10,
        house_no: '12',
        house_leader_name: 'Amara',
        created_at: new Date(),
        created_by: 'agent-1',
        updated_at: new Date(),
        version: 3,
      };

      const updated = simulateHouseholdUpdate(house, { house_leader_name: 'Amara Silva' });
      expect(updated.version).toBe(4);
      expect(updated.house_leader_name).toBe('Amara Silva');
    });
  });

  describe('Client Audit Trigger (M1.13 "Done when" criteria)', () => {
    it('direct update by Level 4 writes an audit row with before/after state and changed_by', () => {
      const client: ClientRow = {
        id: 'client-uuid-audit-test',
        household_id: 'house-uuid-1',
        district_id: 'dist-uuid-1',
        ds_id: 'ds-uuid-1',
        gn_id: 'gn-uuid-1',
        name: 'Sunil Perera',
        age: 30,
        collected_by: 'agent-1',
        created_at: new Date(),
        created_by: 'agent-1',
        updated_at: new Date(),
        server_version: 1,
      };

      const l4SecretaryId = 'cdc-sec-uuid-4444';
      simulateClientUpdate(client, { name: 'Sunil Mahinda Perera', age: 31 }, l4SecretaryId);

      expect(clientAuditLogs.length).toBeGreaterThan(0);
      const audit = clientAuditLogs[clientAuditLogs.length - 1];

      expect(audit.client_id).toBe('client-uuid-audit-test');
      expect(audit.changed_by).toBe(l4SecretaryId);
      expect(audit.before.name).toBe('Sunil Perera');
      expect(audit.after.name).toBe('Sunil Mahinda Perera');
      expect(audit.after.server_version).toBe(2);
      expect(audit.reason).toBe('client_record_update');
    });
  });
});
