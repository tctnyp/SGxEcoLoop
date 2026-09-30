import 'dotenv/config';
import mysql from 'mysql2/promise';

type Impact = { divertedKg: number; plasticKg: number; foodKg: number; otherKg: number; foodCo2eKg: number; approvedActions: number };
type User = { id: string; impact?: Impact };
type Calibration = { id: string; averageWeightGrams: number };
type Submission = { id: string; userId: string; task: string; status: string; wasteStream?: 'plastic' | 'food' | 'other' | null; wasteAction?: 'reduced' | 'repurposed' | 'recycled' | null; estimatedWeightKg?: number | null; impactSource?: string | null; impactApplied?: boolean };

const apply = process.argv.includes('--apply');
const round = (value: number) => Math.round(value * 1000) / 1000;
const emptyImpact = (): Impact => ({ divertedKg: 0, plasticKg: 0, foodKg: 0, otherKg: 0, foodCo2eKg: 0, approvedActions: 0 });

function classify(task: string) {
  const value = task.toLowerCase();
  if (value.includes('food') || value.includes('meal')) return { stream: 'food' as const, action: 'reduced' as const, key: 'food-serving' };
  if (value.includes('bottle')) return { stream: 'plastic' as const, action: value.includes('return') || value.includes('recycl') ? 'recycled' as const : 'reduced' as const, key: 'pet-beverage-bottle' };
  if (value.includes('plastic') || value.includes('recycl') || value.includes('reusable') || value.includes('refill')) return { stream: 'plastic' as const, action: value.includes('recycl') || value.includes('sort') ? 'recycled' as const : 'reduced' as const, key: 'single-use-container' };
  return null;
}

const pool = mysql.createPool({
  host: process.env.NOVO_DB_HOST || '127.0.0.1',
  port: Number(process.env.NOVO_DB_PORT || 3306),
  user: process.env.NOVO_DB_USER || 'novo',
  password: process.env.NOVO_DB_PASSWORD || '',
  database: process.env.NOVO_DB_NAME || 'novo',
});

const connection = await pool.getConnection();
try {
  const read = async <T>(table: string) => (await connection.query(`SELECT record_key, payload FROM ${table}`))[0] as Array<{ record_key: string; payload: string }>;
  const calibrationRows = await read<Calibration>('impact_weight_calibrations');
  const userRows = await read<User>('user_profiles');
  const submissionRows = await read<Submission>('review_queue');
  const calibrations = new Map(calibrationRows.map((row) => { const value = JSON.parse(row.payload) as Calibration; return [value.id, value]; }));
  const users = new Map(userRows.map((row) => [row.record_key, JSON.parse(row.payload) as User]));
  let classified = 0;
  let applied = 0;
  let awaitingCalibration = 0;

  for (const row of submissionRows) {
    const submission = JSON.parse(row.payload) as Submission;
    if (submission.status !== 'approved' || submission.impactApplied) continue;
    const classification = classify(submission.task);
    if (!classification) continue;
    submission.wasteStream ??= classification.stream;
    submission.wasteAction ??= classification.action;
    classified += 1;
    const calibration = calibrations.get(classification.key);
    if (!calibration) {
      submission.impactSource = 'unavailable';
      awaitingCalibration += 1;
      row.payload = JSON.stringify(submission);
      continue;
    }
    submission.estimatedWeightKg = round(calibration.averageWeightGrams / 1000);
    submission.impactSource = 'calibrated';
    const user = [...users.values()].find((candidate) => candidate.id === submission.userId);
    if (!user) continue;
    user.impact ??= emptyImpact();
    const weight = submission.estimatedWeightKg;
    user.impact.divertedKg = round(user.impact.divertedKg + weight);
    if (submission.wasteStream === 'plastic') user.impact.plasticKg = round(user.impact.plasticKg + weight);
    if (submission.wasteStream === 'food') {
      user.impact.foodKg = round(user.impact.foodKg + weight);
      user.impact.foodCo2eKg = round(user.impact.foodCo2eKg + weight * 3.59);
    }
    if (submission.wasteStream === 'other') user.impact.otherKg = round(user.impact.otherKg + weight);
    user.impact.approvedActions += 1;
    submission.impactApplied = true;
    row.payload = JSON.stringify(submission);
    applied += 1;
  }

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', classified, applied, awaitingCalibration }, null, 2));
  if (apply) {
    await connection.beginTransaction();
    for (const row of submissionRows) await connection.execute('UPDATE review_queue SET payload = ? WHERE record_key = ?', [row.payload, row.record_key]);
    for (const row of userRows) await connection.execute('UPDATE user_profiles SET payload = ? WHERE record_key = ?', [JSON.stringify(users.get(row.record_key)), row.record_key]);
    await connection.commit();
  }
} catch (error) {
  if (apply) await connection.rollback().catch(() => undefined);
  throw error;
} finally {
  connection.release();
  await pool.end();
}
