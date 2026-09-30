import type { LockerLocation } from './lockerDirectory.js';

type ReturnPoint = {
  id: string;
  binType: string;
  materialTypes: string[];
  place: string;
  lat: number;
  long: number;
  machineStatus?: string | null;
  openingHours?: {
    alwaysOpen?: boolean;
    weekdayText?: string[];
  } | null;
};

type ReturnPointResponse = {
  result?: {
    data?: {
      json?: {
        nextCursor?: string | null;
        recyclingPoints?: ReturnPoint[];
      };
    };
  };
};

const RETURN_RIGHT_SOURCE_URL = 'https://www.recycle.gov.sg/materials/beverage';
const RETURN_RIGHT_API_URL = 'https://www.recycle.gov.sg/api/trpc/recyclingPoints.infiniteFilteredByMaterial';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_TTL_MS = 5 * 60 * 1000;

export const fallbackReturnRightLocations: LockerLocation[] = [
  { id: 'returnright-fallback-nex', kind: 'return-right', name: 'Return Right @ FairPrice Xtra NEX', address: '23 Serangoon Central, Singapore 556083', latitude: 1.3507, longitude: 103.8723, hours: 'Mall operating hours', sourceUrl: RETURN_RIGHT_SOURCE_URL },
  { id: 'returnright-fallback-cassia-42', kind: 'return-right', name: 'Return Right @ 42 Cassia Crescent', address: '42 Cassia Crescent, Singapore 390042', latitude: 1.3095, longitude: 103.8868, hours: '24 hours', sourceUrl: RETURN_RIGHT_SOURCE_URL },
  { id: 'returnright-fallback-lot-one', kind: 'return-right', name: 'Return Right @ FairPrice Lot One', address: '21 Choa Chu Kang Avenue 4, Singapore 689812', latitude: 1.3851, longitude: 103.7449, hours: 'Store operating hours', sourceUrl: RETURN_RIGHT_SOURCE_URL },
];

function openingHours(point: ReturnPoint) {
  if (point.openingHours?.alwaysOpen) return '24 hours';
  const weekdayText = point.openingHours?.weekdayText?.filter(Boolean) ?? [];
  if (!weekdayText.length) return 'See official locator';
  const dailyTimes = weekdayText.map((row) => row.slice(row.indexOf(':') + 1).trim());
  if (new Set(dailyTimes).size === 1) return `Daily: ${dailyTimes[0]}`;
  return weekdayText.join(' · ');
}

export function parseReturnRightDirectory(payload: ReturnPointResponse): LockerLocation[] {
  const points = payload.result?.data?.json?.recyclingPoints;
  if (!Array.isArray(points) || points.length < 1000) throw new Error('The official locator returned an incomplete Return Right directory.');
  const directory = points
    .filter((point) => point.binType === 'BCRS_RETURN_POINT' && point.materialTypes.includes('BEVERAGE'))
    .map((point) => {
      const place = point.place.replace(/\s+/g, ' ').trim();
      return {
        id: `returnright-${point.id}`,
        kind: 'return-right' as const,
        name: /^Return Right\b/i.test(place) ? place : `Return Right @ ${place}`,
        address: /\bSingapore\b/i.test(place) ? place : `${place}, Singapore`,
        latitude: Number(point.lat),
        longitude: Number(point.long),
        hours: openingHours(point),
        sourceUrl: RETURN_RIGHT_SOURCE_URL,
      };
    })
    .filter((point) => point.name && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  if (directory.length < 1000) throw new Error('The official locator returned too few valid Return Right machines.');
  return directory.sort((left, right) => left.name.localeCompare(right.name, 'en-SG'));
}

function directoryInput() {
  return {
    json: {
      filter: { PLASTIC: false, PAPER: false, METAL: false, GLASS: false, BEVERAGE: true, EWASTE: false, TEXTILE: false, OTHER: false },
      eWasteFilter: { BATTERIES: false, LAMPS: false, ICT_EQUIPMENT: false, INK: false, TONER_CARTRIDGES: false },
      limit: 2000,
      openOnly: false,
    },
  };
}

async function retrieveReturnRightLocations() {
  const input = encodeURIComponent(JSON.stringify(directoryInput()));
  const response = await fetch(`${RETURN_RIGHT_API_URL}?input=${input}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'novo-return-right-directory/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Return Right directory request failed with ${response.status}.`);
  const payload = await response.json() as ReturnPointResponse;
  if (payload.result?.data?.json?.nextCursor) throw new Error('Return Right directory exceeded the requested page size.');
  return parseReturnRightDirectory(payload);
}

type ReturnRightCache = {
  expiresAt: number;
  updatedAt: string;
  locations: LockerLocation[];
  source: 'live' | 'cached' | 'fallback';
};

let cache: ReturnRightCache | null = null;

export async function getReturnRightDirectory(options: { refresh?: boolean; offline?: boolean; persisted?: LockerLocation[] } = {}) {
  if (!options.refresh && cache && cache.expiresAt > Date.now()) return cache;
  if (options.offline) {
    const stored = options.persisted?.filter((location) => location.kind === 'return-right') ?? [];
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, updatedAt: new Date().toISOString(), locations: stored.length ? stored : fallbackReturnRightLocations, source: stored.length ? 'cached' : 'fallback' };
    return cache;
  }
  try {
    const locations = await retrieveReturnRightLocations();
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, updatedAt: new Date().toISOString(), locations, source: 'live' };
  } catch {
    const stored = options.persisted?.filter((location) => location.kind === 'return-right') ?? [];
    cache = { expiresAt: Date.now() + RETRY_TTL_MS, updatedAt: new Date().toISOString(), locations: stored.length ? stored : fallbackReturnRightLocations, source: stored.length ? 'cached' : 'fallback' };
  }
  return cache;
}
