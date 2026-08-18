import { Redis } from '@upstash/redis';

function findEnvKeyEndingWith(suffix) {
  return Object.keys(process.env).find((k) => k.endsWith(suffix));
}

function getRedisClient() {
  const urlKey = findEnvKeyEndingWith('KV_REST_API_URL') || findEnvKeyEndingWith('UPSTASH_REDIS_REST_URL');
  const tokenKey = findEnvKeyEndingWith('KV_REST_API_TOKEN') || findEnvKeyEndingWith('UPSTASH_REDIS_REST_TOKEN');
  if (!urlKey || !tokenKey) return null;
  return new Redis({ url: process.env[urlKey], token: process.env[tokenKey] });
}

function dateKey(d) {
  return `hype:${d.toISOString().slice(0, 10)}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const redis = getRedisClient();
  if (!redis) {
    return res.status(200).json({ configured: false });
  }

  const today = new Date();

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const score = Number(body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Invalid score' });
    }
    await redis.set(dateKey(today), score);
    return res.status(200).json({ ok: true });
  }

  try {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayScore = await redis.get(dateKey(yesterday));

    const pastWeekScores = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const val = await redis.get(dateKey(d));
      if (val !== null && val !== undefined) pastWeekScores.push(Number(val));
    }
    const sevenDayAvg = pastWeekScores.length
      ? Math.round(pastWeekScores.reduce((a, b) => a + b, 0) / pastWeekScores.length)
      : null;

    return res.status(200).json({
      configured: true,
      yesterday: (yesterdayScore !== null && yesterdayScore !== undefined) ? Number(yesterdayScore) : null,
      sevenDayAvg,
    });
  } catch (err) {
    console.error('Hype history read failed:', err);
    return res.status(200).json({ configured: false });
  }
}
