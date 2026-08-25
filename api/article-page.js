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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderShell({ title, description, bodyHtml, url }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<style>
  body{font-family:sans-serif;max-width:680px;margin:0 auto;padding:40px 20px;background:#0a0a0a;color:#eee;}
  a{color:#ff5a1f;text-decoration:none;}
  h1{font-size:28px;line-height:1.3;}
  .meta{color:#999;font-size:13px;margin-bottom:28px;}
  .content p{color:#ddd;line-height:1.7;font-size:16px;margin-bottom:18px;}
  .back{display:inline-block;margin-bottom:24px;font-size:14px;}
  .share-row{margin-top:32px;padding-top:20px;border-top:1px solid #333;display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
  .share-row button, .share-row a{background:#1a1a1a;border:1px solid #333;color:#eee;padding:9px 16px;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit;}
  .share-row button:hover, .share-row a:hover{border-color:#ff5a1f;}
  #copyStatus{font-size:13px;color:#4ade80;}
</style>
</head>
<body>
  <a class="back" href="/">&larr; Back to thefinbro.com</a>
  ${bodyHtml}
  <script>
    function copyLink(){
      navigator.clipboard.writeText(window.location.href).then(() => {
        document.getElementById('copyStatus').textContent = '✓ Link copied!';
      }).catch(() => {
        document.getElementById('copyStatus').textContent = 'Could not copy — copy the URL from your address bar instead.';
      });
    }
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const slug = req.query?.slug;
  const redis = getRedisClient();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!slug || !redis) {
    return res.status(404).send(renderShell({
      title: 'Article not found — The Fin Bro',
      description: '',
      bodyHtml: '<p>Article not found.</p>',
      url: 'https://thefinbro.com/article.html',
    }));
  }

  let article;
  try {
    article = await redis.get(`article:${slug}`);
  } catch (err) {
    console.error('Article page fetch failed:', err);
  }

  if (!article) {
    return res.status(404).send(renderShell({
      title: 'Article not found — The Fin Bro',
      description: '',
      bodyHtml: '<p>Article not found.</p>',
      url: 'https://thefinbro.com/article.html',
    }));
  }

  const description = article.body.length > 155
    ? article.body.slice(0, 155).trim() + '…'
    : article.body.trim();
  const date = new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const paragraphs = article.body.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('');
  const pageUrl = `https://thefinbro.com/article.html?slug=${encodeURIComponent(slug)}`;

  const bodyHtml = `
    <h1>${escapeHtml(article.title)}</h1>
    <div class="meta">${date}${article.aiDrafted ? ' · AI-assisted draft' : ''}</div>
    <div class="content">${paragraphs}</div>
    <div class="share-row">
      <button onclick="copyLink()">🔗 Copy Link</button>
      <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener">Share on X</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}" target="_blank" rel="noopener">Share on Facebook</a>
      <span id="copyStatus"></span>
    </div>
  `;

  return res.status(200).send(renderShell({
    title: `${article.title} — The Fin Bro`,
    description,
    bodyHtml,
    url: pageUrl,
  }));
}
