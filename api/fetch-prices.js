import { fetchLivePrices } from '../lib/priceProvider.js';
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

const CACHE_KEY = 'live-prices-cache';
const CACHE_TTL_SECONDS = 120;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const redis = getRedisClient();

  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return res.status(200).json({ prices: cached, cached: true });
      }
    } catch (err) {
      console.error('Redis cache read failed, falling back to live fetch:', err);
    }
  }

  try {
    const prices = await fetchLivePrices({ apiKey: process.env.TWELVEDATA_API_KEY });
    if (redis) {
      try {
        await redis.set(CACHE_KEY, prices, { ex: CACHE_TTL_SECONDS });
      } catch (err) {
        console.error('Redis cache write failed (non-fatal):', err);
      }
    }
    return res.status(200).json({ prices, cached: false });
  } catch (err) {
    console.error('Price fetch failed:', err);
    if (redis) {
      try {
        const stale = await redis.get(CACHE_KEY);
        if (stale) return res.status(200).json({ prices: stale, cached: true, stale: true });
      } catch {}
    }
    return res.status(500).json({ error: 'Failed to fetch prices' });
  }
}
