import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAreaScopeLocks,
  loadScopedAreaLists,
  resolveProgressAreaQuery,
} from './area-scope.ts';

const mockApi = {
  getDistricts: async () => [
    { id: 'dist-1', nameEn: 'Colombo' },
    { id: 'dist-2', nameEn: 'Nuwara Eliya' },
  ],
  getDsDivisions: async (districtId?: string) => {
    if (districtId === 'dist-1') {
      throw new Error('403 Forbidden: Cannot access DS divisions outside assigned scope');
    }
    return [
      { id: 'ds-1', districtId: 'dist-2', nameEn: 'Nildandahinna' },
      { id: 'ds-2', districtId: 'dist-2', nameEn: 'Walapane' },
    ];
  },
  getGnDivisions: async (dsId?: string) => {
    if (dsId !== 'ds-1') return [];
    return [
      { id: 'gn-1', dsId: 'ds-1', gnName: 'Harasbedda' },
      { id: 'gn-2', dsId: 'ds-1', gnName: 'Nildandahinna' },
    ];
  },
};

describe('area-scope helpers', () => {
  it('locks district/DS/GN according to role hierarchy', () => {
    assert.deepEqual(getAreaScopeLocks('super_admin'), {
      isDistrictLocked: false,
      isDsLocked: false,
      isGnLocked: false,
    });
    assert.deepEqual(getAreaScopeLocks('dc'), {
      isDistrictLocked: true,
      isDsLocked: false,
      isGnLocked: false,
    });
    assert.deepEqual(getAreaScopeLocks('sda'), {
      isDistrictLocked: true,
      isDsLocked: true,
      isGnLocked: false,
    });
    assert.deepEqual(getAreaScopeLocks('cdc_secretary'), {
      isDistrictLocked: true,
      isDsLocked: true,
      isGnLocked: true,
    });
  });

  it('resolves progress query safely without emitting out-of-scope parent levels', () => {
    // SDA with missing selectedDs must never emit areaType=district
    assert.deepEqual(resolveProgressAreaQuery('sda', 'dist-2', '', ''), {});
    assert.deepEqual(resolveProgressAreaQuery('sda', 'dist-2', 'ds-1', ''), {
      areaType: 'ds',
      areaId: 'ds-1',
    });
    assert.deepEqual(resolveProgressAreaQuery('sda', 'dist-2', 'ds-1', 'gn-1'), {
      areaType: 'gn',
      areaId: 'gn-1',
    });

    // CDC secretary must never emit areaType=district or areaType=ds
    assert.deepEqual(resolveProgressAreaQuery('cdc_secretary', 'dist-2', '', ''), {});
    assert.deepEqual(resolveProgressAreaQuery('cdc_secretary', 'dist-2', 'ds-1', ''), {});
    assert.deepEqual(resolveProgressAreaQuery('cdc_secretary', 'dist-2', 'ds-1', 'gn-1'), {
      areaType: 'gn',
      areaId: 'gn-1',
    });

    // DC may query district/ds/gn; super_admin may query any selected level
    assert.deepEqual(resolveProgressAreaQuery('dc', 'dist-2', '', ''), {
      areaType: 'district',
      areaId: 'dist-2',
    });
    assert.deepEqual(resolveProgressAreaQuery('super_admin', '', '', ''), {});
  });

  it('loads SDA scoped lists in one batch without hitting dist-1 and preselects dsId', async () => {
    const res = await loadScopedAreaLists(mockApi, {
      role: 'sda',
      districtId: 'dist-2',
      dsId: 'ds-1',
    });
    assert.equal(res.selectedDistrict, 'dist-2');
    assert.equal(res.selectedDs, 'ds-1');
    assert.equal(res.selectedGn, '');
    assert.deepEqual(
      res.districts.map((d) => d.id),
      ['dist-2'],
    );
    assert.deepEqual(
      res.dsDivisions.map((ds) => ds.id),
      ['ds-1'],
    );
    assert.equal(res.gnDivisions.length, 2);
  });

  it('loads CDC secretary scoped lists with fixed gnId', async () => {
    const res = await loadScopedAreaLists(mockApi, {
      role: 'cdc_secretary',
      districtId: 'dist-2',
      dsId: 'ds-1',
      gnId: 'gn-2',
    });
    assert.equal(res.selectedDistrict, 'dist-2');
    assert.equal(res.selectedDs, 'ds-1');
    assert.equal(res.selectedGn, 'gn-2');
    assert.deepEqual(
      res.gnDivisions.map((g) => g.id),
      ['gn-2'],
    );
  });

  it('loads DC scoped district with open DS list', async () => {
    const res = await loadScopedAreaLists(mockApi, {
      role: 'dc',
      districtId: 'dist-2',
    });
    assert.equal(res.selectedDistrict, 'dist-2');
    assert.equal(res.selectedDs, '');
    assert.equal(res.selectedGn, '');
    assert.equal(res.dsDivisions.length, 2);
  });

  it('loads CDC secretary with multi-GN assignments and auto-selects primary GN', async () => {
    const res = await loadScopedAreaLists(mockApi, {
      role: 'cdc_secretary',
      districtId: 'dist-2',
      dsId: 'ds-1',
      gnId: 'gn-1',
      assignments: [
        { gnId: 'gn-1', isActiveArea: true },
        { gnId: 'gn-2', isActiveArea: false },
      ],
    });
    assert.equal(res.selectedDistrict, 'dist-2');
    assert.equal(res.selectedDs, 'ds-1');
    assert.equal(res.selectedGn, 'gn-1');
    assert.deepEqual(
      res.gnDivisions.map((g) => g.id),
      ['gn-1', 'gn-2'],
    );
  });

  it('safely falls back to available district and DS when districtId is missing for cdc_secretary', async () => {
    const fallbackApi = {
      getDistricts: async () => [{ id: 'dist-2', nameEn: 'Nuwara Eliya' }],
      getDsDivisions: async () => [{ id: 'ds-1', districtId: 'dist-2', nameEn: 'Walapane' }],
      getGnDivisions: async () => [{ id: 'gn-1', dsId: 'ds-1', gnName: 'Harasbedda' }],
    };

    const res = await loadScopedAreaLists(fallbackApi, {
      role: 'cdc_secretary',
      districtId: null,
      dsId: null,
      gnId: 'gn-1',
    });
    assert.equal(res.selectedDistrict, 'dist-2');
    assert.equal(res.selectedDs, 'ds-1');
    assert.equal(res.selectedGn, 'gn-1');
  });
});

