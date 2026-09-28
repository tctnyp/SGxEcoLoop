import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceUrl = 'https://www.picknetwork.com/pick-lockers';
const response = await fetch(sourceUrl, { headers: { Accept: 'text/html', 'User-Agent': 'novo-location-snapshot/1.0' } });
if (!response.ok) throw new Error(`Pick Network returned ${response.status}.`);
const html = await response.text();
const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Pick Network page data was not found.');
const page = JSON.parse(match[1]);
const lockers = page.props?.pageProps?.allLockers;
if (!Array.isArray(lockers) || lockers.length < 1000) throw new Error('Pick Network returned an incomplete directory.');

function clean(parts) {
  return parts.map((part) => typeof part === 'string' ? part.trim() : '').filter(Boolean);
}

function unique(parts) {
  return parts.filter((part, index) => parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index);
}

const locations = lockers.map((locker) => {
  const street = clean([locker.block_no, locker.street_name]).join(' ');
  const building = locker.building_name?.toLowerCase() === 'hdb' ? '' : locker.building_name;
  return {
    id: `pick-${locker.id}`,
    kind: 'pick-locker',
    name: String(locker.station_name || '').replace(/^Pick\s*-\s*/i, 'Pick! Locker @ '),
    address: unique(clean([street, building, locker.postal_code ? `Singapore ${locker.postal_code}` : 'Singapore'])).join(', '),
    latitude: Number(locker.latitude),
    longitude: Number(locker.longitude),
    hours: locker.opening_hours?.trim() || 'See official locator',
    sourceUrl,
  };
}).filter((locker) => locker.name && locker.address && Number.isFinite(locker.latitude) && Number.isFinite(locker.longitude));

if (locations.length < 1000) throw new Error(`Only ${locations.length} valid Pick lockers were found.`);
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../data/pick-lockers.snapshot.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), sourceUrl, locations })}\n`, 'utf8');
console.log(`Saved ${locations.length} Pick lockers to ${outputPath}`);
