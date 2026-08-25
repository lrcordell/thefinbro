import { runPipeline } from '../lib/pipeline.js';
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

const FEED_KEY = 'persisted-feed';
const PULL_MARKER_KEY = 'news-pull-marker';
const PULL_INTERVAL_SECONDS = 15 * 60;
const MAX_FEED_SIZE = 10;
const PULL_BATCH_SIZE = 6;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const redis = getRedisClient();

  if (!redis) {
    try {
      const news = await runPipeline({
        marketauxKey: process.env.MARKETAUX_API_KEY,
        anthropicKey: process.env.ANTHROPIC_API_KEY,
        limit: MAX_FEED_SIZE,
      });
      return res.status(200).json({ news, cached: false });
    } catch (err) {
      console.error('Pipeline failed:', err);
      return res.status(500).json({ error: 'Failed to fetch news' });
    }
  }

  try {
    const recentlyPulled = await redis.get(PULL_MARKER_KEY);

    if (!recentlyPulled) {
      const freshBatch = await runPipeline({
        marketauxKey: process.env.MARKETAUX_API_KEY,
        anthropicKey: process.env.ANTHROPIC_API_KEY,
        limit: PULL_BATCH_SIZE,
      });

      const existing = (await redis.get(FEED_KEY)) || [];

      const merged = [...freshBatch, ...existing];
      const seen = new Set();
      const deduped = [];
      for (const item of merged) {
        const key = item.sourceUrl || item.title;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
        if (deduped.length >= MAX_FEED_SIZE) break;
      }

      const finalNews = deduped.map((item, i) => ({ ...item, locked: i % 3 === 2 }));

      await redis.set(FEED_KEY, finalNews);
      await redis.set(PULL_MARKER_KEY, '1', { ex: PULL_INTERVAL_SECONDS });
    }

    const news = (await redis.get(FEED_KEY)) || [];
    return res.status(200).json({ news, cached: !!recentlyPulled });
  } catch (err) {
    console.error('Pipeline failed:', err);
    try {
      const stale = await redis.get(FEED_KEY);
      if (stale) return res.status(200).json({ news: stale, cached: true, stale: true });
    } catch {}
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
