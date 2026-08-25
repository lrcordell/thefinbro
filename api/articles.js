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

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) + '-' + Date.now().toString(36);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const redis = getRedisClient();
  if (!redis) {
    return res.status(200).json({ configured: false, articles: [] });
  }

  if (req.method === 'GET') {
    try {
      const slug = req.query?.slug;
      if (slug) {
        const article = await redis.get(`article:${slug}`);
        if (!article) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json({ article });
      }
      const index = (await redis.get('articles-index')) || [];
      return res.status(200).json({ articles: index });
    } catch (err) {
      console.error('Article read failed:', err);
      return res.status(500).json({ error: 'Failed to load articles' });
    }
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (!process.env.ADMIN_PASSWORD || body?.password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const title = (body?.title || '').trim();
    const articleBody = (body?.body || '').trim();
    if (!title || !articleBody) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const slug = slugify(title);
    const publishedAt = new Date().toISOString();
    const article = {
      slug,
      title,
      body: articleBody,
      aiDrafted: !!body?.aiDrafted,
      publishedAt,
    };

    try {
      await redis.set(`article:${slug}`, article);
      const index = (await redis.get('articles-index')) || [];
      index.unshift({ slug, title, publishedAt });
      await redis.set('articles-index', index.slice(0, 100));
      return res.status(200).json({ ok: true, slug });
    } catch (err) {
      console.error('Article publish failed:', err);
      return res.status(500).json({ error: 'Failed to publish article' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
