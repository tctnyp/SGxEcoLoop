export type LockerLocation = {
  id: string;
  kind: 'pick-locker' | 'singpost-locker' | 'return-right';
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  hours: string;
  sourceUrl: string;
};

type PickLocker = {
  id: string;
  station_name: string;
  station_desc?: string | null;
  block_no?: string | null;
  building_name?: string | null;
  street_name?: string | null;
  postal_code?: string | null;
  latitude: number;
  longitude: number;
  opening_hours?: string | null;
};

type PopStation = {
  KioskId: string;
  POPStationName: string;
  Storey?: string;
  UnitNumber?: string;
  HouseBlockNumber?: string;
  BuildingName?: string;
  StreetName?: string;
  ZipCode?: string;
  PostCode?: string;
  Location?: string;
  OperationHours?: string;
  Latitude: number;
  Longitude: number;
};

const PICK_LOCATOR_URL = 'https://www.picknetwork.com/pick-lockers';
const POPSTATION_API_URL = 'https://plugins.mypopstation.com/api/kiosklocation?country=SG';
const POPSTATION_LOCATOR_URL = 'https://www.singpost.com/locate-us?locationtype=PopStation';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const fallbackLockerLocations: LockerLocation[] = [
  { id: 'pick-fallback-360b-admiralty', kind: 'pick-locker', name: 'Pick! Locker @ 360B Admiralty Drive', address: '360B Admiralty Drive, Singapore 752360', latitude: 1.4486184, longitude: 103.8152086, hours: '24 hours', sourceUrl: PICK_LOCATOR_URL },
  { id: 'pick-fallback-kallang-mrt', kind: 'pick-locker', name: 'Pick! Locker @ Kallang MRT Station', address: '5 Sims Avenue, Singapore 387405', latitude: 1.3114, longitude: 103.8714, hours: '24 hours', sourceUrl: PICK_LOCATOR_URL },
  { id: 'pick-fallback-dakota-mrt', kind: 'pick-locker', name: 'Pick! Locker @ Dakota MRT Station', address: '211 Old Airport Road, Singapore 397973', latitude: 1.3083, longitude: 103.8886, hours: '24 hours', sourceUrl: PICK_LOCATOR_URL },
  { id: 'pop-fallback-general-post-office', kind: 'singpost-locker', name: 'POPStation @ General Post Office', address: '10 Eunos Road 8, Singapore 408600', latitude: 1.3196, longitude: 103.8935, hours: '24 hours', sourceUrl: POPSTATION_LOCATOR_URL },
  { id: 'pop-fallback-toa-payoh', kind: 'singpost-locker', name: 'POPStation @ Toa Payoh Central Post Office', address: '520 Lorong 6 Toa Payoh, Singapore 310520', latitude: 1.3321, longitude: 103.8483, hours: '24 hours', sourceUrl: POPSTATION_LOCATOR_URL },
  { id: 'pop-fallback-ang-mo-kio', kind: 'singpost-locker', name: 'POPStation @ Ang Mo Kio Central Post Office', address: '727 Ang Mo Kio Avenue 6, Singapore 560727', latitude: 1.3726, longitude: 103.8465, hours: '24 hours', sourceUrl: POPSTATION_LOCATOR_URL },
];

function clean(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
}

function uniqueAddressParts(parts: string[]) {
  return parts.filter((part, index) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index);
}

export function parsePickDirectory(html: string): LockerLocation[] {
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Pick! locator data was not found.');
  const page = JSON.parse(match[1]) as { props?: { pageProps?: { allLockers?: PickLocker[] } } };
  const lockers = page.props?.pageProps?.allLockers;
  if (!Array.isArray(lockers) || lockers.length < 1000) throw new Error('Pick! returned an incomplete locker directory.');
  const directory = lockers.map((locker) => {
    const street = clean([locker.block_no, locker.street_name]).join(' ');
    const building = locker.building_name && locker.building_name.toLowerCase() !== 'hdb' ? locker.building_name : null;
    const countryAndPostal = locker.postal_code ? `Singapore ${locker.postal_code}` : 'Singapore';
    const address = uniqueAddressParts(clean([street, building, countryAndPostal])).join(', ');
    return {
      id: `pick-${locker.id}`,
      kind: 'pick-locker' as const,
      name: locker.station_name.replace(/^Pick\s*-\s*/i, 'Pick! Locker @ '),
      address,
      latitude: Number(locker.latitude),
      longitude: Number(locker.longitude),
      hours: locker.opening_hours?.trim() || 'See official locator',
      sourceUrl: PICK_LOCATOR_URL,
    };
  }).filter((locker) => locker.name && locker.address && Number.isFinite(locker.latitude) && Number.isFinite(locker.longitude));
  if (directory.length < 1000) throw new Error('Pick! returned too few valid locker locations.');
  return directory;
}

export function parsePopStationDirectory(stations: unknown): LockerLocation[] {
  if (!Array.isArray(stations) || stations.length < 40) throw new Error('SingPost returned an incomplete POPStation directory.');
  const directory = (stations as PopStation[]).map((station) => {
    const street = clean([station.HouseBlockNumber, station.StreetName]).join(' ');
    const unit = clean([station.Storey, station.UnitNumber]).join(' ');
    const postalCode = station.ZipCode || station.PostCode || '';
    const countryAndPostal = postalCode ? `Singapore ${postalCode}` : 'Singapore';
    const address = uniqueAddressParts(clean([street, station.BuildingName, unit, countryAndPostal])).join(', ');
    return {
      id: `pop-${station.KioskId}`,
      kind: 'singpost-locker' as const,
      name: station.POPStationName.replace(/^POPStation\s*@?\s*/i, 'POPStation @ '),
      address,
      latitude: Number(station.Latitude),
      longitude: Number(station.Longitude),
      hours: station.OperationHours?.trim() || station.Location?.trim() || 'See official locator',
      sourceUrl: POPSTATION_LOCATOR_URL,
    };
  }).filter((station) => station.name && station.address && Number.isFinite(station.latitude) && Number.isFinite(station.longitude));
  if (directory.length < 40) throw new Error('SingPost returned too few valid POPStation locations.');
  return directory;
}

async function fetchWithTimeout(url: string) {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/json', 'User-Agent': 'novo-locker-directory/1.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Locker directory request failed with ${response.status}.`);
  return response;
}

async function retrievePickLockers() {
  const response = await fetchWithTimeout(PICK_LOCATOR_URL);
  return parsePickDirectory(await response.text());
}

async function retrievePopStations() {
  const response = await fetchWithTimeout(POPSTATION_API_URL);
  return parsePopStationDirectory(await response.json());
}

let cache: { expiresAt: number; updatedAt: string; lockers: LockerLocation[]; sourceCounts: { pick: number; popStation: number } } | null = null;

export async function getLockerDirectory(options: { refresh?: boolean; offline?: boolean } = {}) {
  if (!options.refresh && cache && cache.expiresAt > Date.now()) return cache;
  if (options.offline) {
    const offline = { expiresAt: Date.now() + CACHE_TTL_MS, updatedAt: new Date().toISOString(), lockers: fallbackLockerLocations, sourceCounts: { pick: 3, popStation: 3 } };
    cache = offline;
    return offline;
  }

  const [pickResult, popResult] = await Promise.allSettled([retrievePickLockers(), retrievePopStations()]);
  const pick = pickResult.status === 'fulfilled' ? pickResult.value : fallbackLockerLocations.filter((locker) => locker.kind === 'pick-locker');
  const popStation = popResult.status === 'fulfilled' ? popResult.value : fallbackLockerLocations.filter((locker) => locker.kind === 'singpost-locker');
  const lockers = [...pick, ...popStation].sort((left, right) => left.name.localeCompare(right.name, 'en-SG'));
  cache = { expiresAt: Date.now() + CACHE_TTL_MS, updatedAt: new Date().toISOString(), lockers, sourceCounts: { pick: pick.length, popStation: popStation.length } };
  return cache;
}

export function searchLockerDirectory(lockers: LockerLocation[], query: string, provider?: string) {
  const normalized = query.trim().toLocaleLowerCase('en-SG');
  return lockers.filter((locker) => {
    if (provider === 'pick' && locker.kind !== 'pick-locker') return false;
    if (provider === 'popstation' && locker.kind !== 'singpost-locker') return false;
    if (!normalized) return true;
    return `${locker.name} ${locker.address}`.toLocaleLowerCase('en-SG').includes(normalized);
  });
}
