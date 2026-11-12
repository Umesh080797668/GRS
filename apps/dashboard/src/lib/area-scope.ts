export interface ScopedAreaUser {
  role?: string | null;
  districtId?: string | null;
  dsId?: string | null;
  gnId?: string | null;
}

export interface AreaScopeLocks {
  isDistrictLocked: boolean;
  isDsLocked: boolean;
  isGnLocked: boolean;
}

export interface AreaLookupApi {
  getDistricts: () => Promise<any[]>;
  getDsDivisions: (districtId?: string) => Promise<any[]>;
  getGnDivisions: (dsId?: string) => Promise<any[]>;
}

export interface ScopedAreaLoadResult {
  districts: any[];
  dsDivisions: any[];
  gnDivisions: any[];
  selectedDistrict: string;
  selectedDs: string;
  selectedGn: string;
  locks: AreaScopeLocks;
}

/**
 * Returns which geographic hierarchy selectors are fixed to the signed-in role's scope.
 */
export function getAreaScopeLocks(role?: string | null): AreaScopeLocks {
  return {
    isDistrictLocked: role === 'dc' || role === 'sda' || role === 'cdc_secretary',
    isDsLocked: role === 'sda' || role === 'cdc_secretary',
    isGnLocked: role === 'cdc_secretary',
  };
}

/**
 * Resolves safe `/v1/stats/progress` query parameters without emitting an
 * out-of-scope parent level (such as `areaType=district` for `sda` or `cdc_secretary`).
 */
export function resolveProgressAreaQuery(
  role: string | null | undefined,
  selectedDistrict: string,
  selectedDs: string,
  selectedGn: string,
): { areaType?: 'district' | 'ds' | 'gn'; areaId?: string } {
  const locks = getAreaScopeLocks(role);

  if (selectedGn) {
    return { areaType: 'gn', areaId: selectedGn };
  }
  if (selectedDs && !locks.isGnLocked) {
    return { areaType: 'ds', areaId: selectedDs };
  }
  if (selectedDistrict && !locks.isDsLocked) {
    return { areaType: 'district', areaId: selectedDistrict };
  }
  return {};
}

/**
 * Loads districts, DS divisions, and GN divisions sequentially before returning all
 * resolved selections together so callers commit React state in one synchronous batch.
 */
export async function loadScopedAreaLists(
  apiClient: AreaLookupApi,
  user: ScopedAreaUser | null | undefined,
  options?: {
    autoSelectFirst?: boolean;
    preferredDistrictId?: string;
    preferredDsId?: string;
    preferredGnId?: string;
  },
): Promise<ScopedAreaLoadResult> {
  const locks = getAreaScopeLocks(user?.role);
  const autoSelectFirst = options?.autoSelectFirst === true;

  const rawDistricts = await apiClient.getDistricts();
  const districts =
    locks.isDistrictLocked && user?.districtId
      ? rawDistricts.filter((d) => d.id === user.districtId)
      : rawDistricts;

  const selectedDistrict =
    (locks.isDistrictLocked ? user?.districtId : undefined) ||
    (options?.preferredDistrictId && districts.some((d) => d.id === options.preferredDistrictId)
      ? options.preferredDistrictId
      : undefined) ||
    (autoSelectFirst ? user?.districtId || districts[0]?.id || '' : '');

  let dsDivisions: any[] = [];
  let selectedDs = '';

  if (selectedDistrict) {
    const rawDs = await apiClient.getDsDivisions(selectedDistrict);
    dsDivisions =
      locks.isDsLocked && user?.dsId
        ? rawDs.filter((ds) => ds.id === user.dsId)
        : rawDs;

    selectedDs =
      (locks.isDsLocked ? user?.dsId : undefined) ||
      (options?.preferredDsId && dsDivisions.some((ds) => ds.id === options.preferredDsId)
        ? options.preferredDsId
        : undefined) ||
      (autoSelectFirst ? user?.dsId || dsDivisions[0]?.id || '' : '');
  }

  let gnDivisions: any[] = [];
  let selectedGn = '';

  if (selectedDs) {
    const rawGns = await apiClient.getGnDivisions(selectedDs);
    gnDivisions =
      locks.isGnLocked && user?.gnId
        ? rawGns.filter((gn) => gn.id === user.gnId)
        : rawGns;

    selectedGn =
      (locks.isGnLocked ? user?.gnId : undefined) ||
      (options?.preferredGnId && gnDivisions.some((gn) => gn.id === options.preferredGnId)
        ? options.preferredGnId
        : undefined) ||
      (autoSelectFirst ? user?.gnId || gnDivisions[0]?.id || '' : '');
  }

  return {
    districts,
    dsDivisions,
    gnDivisions,
    selectedDistrict,
    selectedDs,
    selectedGn,
    locks,
  };
}

