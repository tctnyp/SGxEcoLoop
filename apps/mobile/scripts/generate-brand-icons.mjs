import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'assets');
const webAssets = resolve(root, '../web/public');
const size = 1024;

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit += 1) result = (result & 1) ? 0xEDB88320 ^ (result >>> 1) : result >>> 1;
  return result >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(pixel) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [red, green, blue, alpha] = pixel(x + 0.5, y + 0.5);
      const offset = row + 1 + x * 4;
      rows[offset] = red;
      rows[offset + 1] = green;
      rows[offset + 2] = blue;
      rows[offset + 3] = alpha;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rotate(x, y, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine - y * sine, x * sine + y * cosine];
}

function cubicPoint(start, controlA, controlB, end, progress) {
  const inverse = 1 - progress;
  return [
    inverse ** 3 * start[0] + 3 * inverse ** 2 * progress * controlA[0] + 3 * inverse * progress ** 2 * controlB[0] + progress ** 3 * end[0],
    inverse ** 3 * start[1] + 3 * inverse ** 2 * progress * controlA[1] + 3 * inverse * progress ** 2 * controlB[1] + progress ** 3 * end[1],
  ];
}

const leafTipA = [-150, 0];
const leafTipB = [150, 0];
const leafOutline = [];
for (let step = 0; step <= 42; step += 1) leafOutline.push(cubicPoint(leafTipA, [-92, -118], [78, -130], leafTipB, step / 42));
for (let step = 1; step <= 42; step += 1) leafOutline.push(cubicPoint(leafTipB, [82, 108], [-82, 116], leafTipA, step / 42));

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    if ((currentY > y) !== (previousY > y) && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX) inside = !inside;
  }
  return inside;
}

function leafAlpha(x, y) {
  const offsets = [-0.3, 0.3];
  let samples = 0;
  for (const offsetX of offsets) for (const offsetY of offsets) {
    const rotated = rotate(x + offsetX - 512, y + offsetY - 512, -38 * Math.PI / 180);
    const localX = rotated[0] / 1.28;
    const localY = rotated[1] / 1.28;
    if (Math.abs(localX) <= 152 && Math.abs(localY) <= 132 && insidePolygon(localX, localY, leafOutline)) samples += 1;
  }
  return Math.round(samples * 255 / 4);
}

function leafVeinAlpha(x, y) {
  const rotated = rotate(x - 512, y - 512, -38 * Math.PI / 180);
  const localX = rotated[0] / 1.28;
  const localY = rotated[1] / 1.28;
  if (localX < -112 || localX > 118) return 0;
  const distance = Math.abs(localY - 0.00045 * localX * localX + 3);
  if (distance <= 2.5) return 82;
  return distance < 3.5 ? Math.round((3.5 - distance) * 82) : 0;
}

function composite(background, foreground, foregroundAlpha) {
  const amount = foregroundAlpha / 255;
  return background.map((channel, index) => Math.round(channel * (1 - amount) + foreground[index] * amount));
}

const leaf = [218, 241, 84];
const forest = [23, 53, 42];

mkdirSync(assets, { recursive: true });
mkdirSync(webAssets, { recursive: true });

const brandIcon = png((x, y) => {
  const leafAmount = leafAlpha(x, y);
  const leafColor = composite(forest, leaf, leafAmount);
  const color = composite(leafColor, forest, Math.round(leafVeinAlpha(x, y) * leafAmount / 255));
  return [...color, 255];
});

writeFileSync(resolve(assets, 'icon.png'), brandIcon);
writeFileSync(resolve(webAssets, 'novo-icon.png'), brandIcon);

writeFileSync(resolve(assets, 'adaptive-icon.png'), png((x, y) => {
  const leafAmount = leafAlpha(x, y);
  const color = composite(leaf, forest, leafVeinAlpha(x, y));
  return [...color, leafAmount];
}));

console.log('Generated mobile icons and the shared web brand icon');
