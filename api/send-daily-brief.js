export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const siteUrl = 'https://thefinbro.com';
    const newsRes = await fetch(`${siteUrl}/api/fetch-news`);
    if (!newsRes.ok) throw new Error(`fetch-news returned ${newsRes.status}`);
    const { news } = await newsRes.json();
    if (!news || !news.length) throw new Error('No news content available to send');

    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const articlesHtml = news.map(n => `
      <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #333;">
        <div style="font-family:monospace;font-size:12px;color:#999;margin-bottom:6px;">${n.tkr} &middot; ${n.source}</div>
        <h3 style="margin:0 0 8px 0;font-size:18px;">${n.locked ? '🔒 ' : ''}${n.title}</h3>
        <p style="margin:0;color:#ccc;line-height:1.5;">${n.locked ? 'Full breakdown available to Pro members.' : n.body}</p>
      </div>
    `).join('');

    const bodyHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h1 style="font-size:24px;">The Fin Bro — Morning Brief</h1>
        <p style="color:#999;font-size:14px;">${today}</p>
        ${articlesHtml}
        <p style="text-align:center;margin-top:32px;">
          <a href="https://thefinbro.com" style="color:#ff5a1f;">Read today's full feed at thefinbro.com</a>
        </p>
      </div>
    `;

    const beehiivRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIV_PUBLICATION_ID}/posts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          title: `Morning Brief — ${today}`,
          status: 'confirmed',
          platform: 'both',
          body_content: bodyHtml,
        }),
      }
    );

    const beehiivData = await beehiivRes.json();
    if (!beehiivRes.ok) {
      console.error('Beehiiv send failed:', beehiivData);
      return res.status(502).json({ error: 'Beehiiv API error', details: beehiivData });
    }

    return res.status(200).json({ ok: true, sent: true, articleCount: news.length });
  } catch (err) {
    console.error('Daily brief send failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
