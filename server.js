const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));

// KIS API Base URLs
const KIS_HOST_REAL = 'https://openapi.koreainvestment.com:9443';
const KIS_HOST_MOCK = 'https://openapivts.koreainvestment.com:29443';

/**
 * 1. POST /api/broker/token
 * Request OAuth Access Token from KIS
 */
app.post('/api/broker/token', async (req, res) => {
  const { appkey, appsecret, isMock } = req.body;

  if (!appkey || !appsecret) {
    return res.status(400).json({ error: 'AppKey and AppSecret are required' });
  }

  const host = isMock ? KIS_HOST_MOCK : KIS_HOST_REAL;
  const url = `${host}/oauth2/tokenP`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey,
        appsecret
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('[Backend Proxy] Token Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

/**
 * 2. POST /api/broker/balance
 * Request Account Balance and Holdings from KIS
 */
app.post('/api/broker/balance', async (req, res) => {
  const { appkey, appsecret, token, cano, acntPrdtCd, isMock } = req.body;

  if (!appkey || !appsecret || !token || !cano || !acntPrdtCd) {
    return res.status(400).json({ error: 'All credentials (appkey, appsecret, token, cano, acntPrdtCd) are required' });
  }

  const host = isMock ? KIS_HOST_MOCK : KIS_HOST_REAL;
  const tr_id = isMock ? 'VTTC8434R' : 'TTTC8434R'; // Balance inquiry TR ID
  
  // Construct URL with query parameters
  const queryParams = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '00',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: ''
  });

  const url = `${host}/uapi/domestic-stock/v1/trading/inquire-balance?${queryParams.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'appkey': appkey,
        'appsecret': appsecret,
        'tr_id': tr_id
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('[Backend Proxy] Balance Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

/**
 * 3. POST /api/broker/order
 * Place buy or sell order to KIS
 */
app.post('/api/broker/order', async (req, res) => {
  const { appkey, appsecret, token, cano, acntPrdtCd, pdno, ordQty, ordUnpr, ordDvsn, isBuy, isMock } = req.body;

  if (!appkey || !appsecret || !token || !cano || !acntPrdtCd || !pdno || !ordQty || ordUnpr === undefined || !ordDvsn) {
    return res.status(400).json({ error: 'Missing required fields for order placement' });
  }

  const host = isMock ? KIS_HOST_MOCK : KIS_HOST_REAL;
  
  // TR ID determination
  let tr_id = '';
  if (isMock) {
    tr_id = isBuy ? 'VTTC0802U' : 'VTTC0801U'; // Mock Buy / Sell
  } else {
    tr_id = isBuy ? 'TTTC0802U' : 'TTTC0801U'; // Real Buy / Sell
  }

  const url = `${host}/uapi/domestic-stock/v1/trading/order-cash`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'appkey': appkey,
        'appsecret': appsecret,
        'tr_id': tr_id
      },
      body: JSON.stringify({
        CANO: cano,
        ACNT_PRDT_CD: acntPrdtCd,
        PDNO: pdno,
        ORD_DVSN: ordDvsn, // "00": Limit, "01": Market
        ORD_QTY: ordQty.toString(),
        ORD_UNPR: ordUnpr.toString()
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('[Backend Proxy] Order Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

/**
 * 4. POST /api/broker/market-rank
 * 국내 주식 거래량 순위 조회 (실거래 전용, 모의 미지원)
 * KIS TR: FHPST01710000
 */
app.post('/api/broker/market-rank', async (req, res) => {
  const { appkey, appsecret, token, isMock } = req.body;
  if (!appkey || !appsecret || !token) {
    return res.status(400).json({ error: 'AppKey, AppSecret, Token are required' });
  }
  if (isMock) {
    // 모의 환경은 이 API를 지원하지 않음 → 빈 배열 반환 (Gemini 검색으로 대체)
    return res.json({ output: [] });
  }

  const url = `${KIS_HOST_REAL}/uapi/domestic-stock/v1/quotations/volume-rank`;
  const queryParams = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',   // J: 코스피, Q: 코스닥
    FID_COND_SCR_DIV_CODE: '20171',
    FID_INPUT_ISCD: '0000',
    FID_DIV_CLS_CODE: '0',
    FID_BLNG_CLS_CODE: '0',
    FID_TRGT_CLS_CODE: '111111111',
    FID_TRGT_EXLS_CLS_CODE: '000000',
    FID_INPUT_PRICE_1: '',
    FID_INPUT_PRICE_2: '',
    FID_VOL_CNT: '',
    FID_INPUT_DATE_1: ''
  });

  try {
    const response = await fetch(`${url}?${queryParams}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'appkey': appkey,
        'appsecret': appsecret,
        'tr_id': 'FHPST01710000',
        'custtype': 'P'
      }
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error('[Backend Proxy] Market Rank Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

/**
 * 5. POST /api/broker/market-index
 * 코스피/코스닥 지수 현황 조회 (실거래 전용)
 * KIS TR: FHPUP02100000
 */
app.post('/api/broker/market-index', async (req, res) => {
  const { appkey, appsecret, token, isMock } = req.body;
  if (!appkey || !appsecret || !token) {
    return res.status(400).json({ error: 'AppKey, AppSecret, Token are required' });
  }
  if (isMock) {
    return res.json({ output: null });
  }

  const results = {};
  const indices = [
    { code: '0001', name: '코스피' },
    { code: '1001', name: '코스닥' },
  ];

  try {
    for (const idx of indices) {
      const queryParams = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: idx.code
      });
      const response = await fetch(
        `${KIS_HOST_REAL}/uapi/domestic-stock/v1/quotations/inquire-index-price?${queryParams}`,
        {
          method: 'GET',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'appkey': appkey,
            'appsecret': appsecret,
            'tr_id': 'FHPUP02100000'
          }
        }
      );
      const data = await response.json();
      if (response.ok && data.output) {
        results[idx.name] = {
          current: data.output.bstp_nmix_prpr,    // 현재 지수
          change: data.output.bstp_nmix_prdy_vrss, // 전일 대비
          rate: data.output.prdy_ctrt             // 등락률
        };
      }
    }
    res.json({ output: results });
  } catch (err) {
    console.error('[Backend Proxy] Market Index Error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

/**
 * 6. GET /api/youtube-rss
 * Fetch and parse YouTube RSS feed for a channel without external XML parser dependency
 */
app.get('/api/youtube-rss', async (req, res) => {
  const { channelId } = req.query;
  if (!channelId) {
    return res.status(400).json({ error: 'channelId is required' });
  }

  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`YouTube RSS request failed with status ${response.status}`);
    }
    const xmlText = await response.text();

    const entries = [];
    // Split by <entry> tags to extract individual videos
    const entryBlocks = xmlText.split('<entry>');
    const authorMatch = xmlText.match(/<author>\s*<name>(.*?)<\/name>/);
    const feedAuthor = authorMatch ? authorMatch[1] : '';

    for (let i = 1; i < entryBlocks.length; i++) {
      const block = entryBlocks[i];
      const titleMatch = block.match(/<title>(.*?)<\/title>/);
      const videoIdMatch = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const publishedMatch = block.match(/<published>(.*?)<\/published>/);
      const descMatch = block.match(/<media:description>(.*?)<\/media:description>/s);

      if (titleMatch && videoIdMatch) {
        const title = decodeXml(titleMatch[1]);
        const videoId = videoIdMatch[1];
        const published = publishedMatch ? publishedMatch[1] : '';
        const description = descMatch ? decodeXml(descMatch[1]) : '';

        entries.push({
          channelName: feedAuthor,
          channelId,
          title,
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          published,
          description: description.substring(0, 200) + (description.length > 200 ? '...' : '')
        });
      }
    }

    res.json({ channelName: feedAuthor, entries });
  } catch (err) {
    console.error(`[Backend Proxy] YouTube RSS Error for channel ${channelId}:`, err);
    res.status(500).json({ error: 'Failed to fetch or parse RSS', details: err.message });
  }
});

function decodeXml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
}


/**
 * 7. POST /api/youtube-channel-resolve
 * Resolve YouTube handle or URL into channel ID and name
 */
app.post('/api/youtube-channel-resolve', async (req, res) => {
  let { urlOrHandle } = req.body;
  if (!urlOrHandle) {
    return res.status(400).json({ error: 'urlOrHandle is required' });
  }

  let handle = urlOrHandle.trim();

  // If already a direct 24-character ID starting with UC, fetch RSS to resolve title
  if (/^UC[A-Za-z0-9_-]{22}$/.test(handle)) {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${handle}`;
    try {
      const rssRes = await fetch(rssUrl);
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const authorMatch = xml.match(/<author>\s*<name>(.*?)<\/name>/);
        const name = authorMatch ? decodeXml(authorMatch[1]) : handle;
        return res.json({ name, id: handle });
      }
    } catch (e) {
      // fallback
    }
    return res.json({ name: handle, id: handle });
  }

  // Parse channel URL
  if (handle.includes('youtube.com/')) {
    const parts = handle.split('youtube.com/');
    handle = parts[1];
  }

  // Clean path prefixes
  handle = handle.replace(/^(c\/|user\/|channel\/)/, '');
  // Extract handle if URL has queries or paths
  handle = handle.split('?')[0].split('/')[0];

  if (!handle.startsWith('@') && !handle.startsWith('UC')) {
    handle = '@' + handle;
  }

  const url = `https://www.youtube.com/${handle}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube returned status ${response.status}`);
    }

    const html = await response.text();

    // Try finding channel ID from og:url or twitter:url or externalId
    let channelId = '';
    const ogMatch = html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/);
    if (ogMatch) {
      channelId = ogMatch[1];
    } else {
      const twitterMatch = html.match(/<meta name="twitter:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/);
      if (twitterMatch) {
        channelId = twitterMatch[1];
      } else {
        const extMatch = html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/);
        if (extMatch) {
          channelId = extMatch[1];
        } else {
          const itemPropMatch = html.match(/<meta itemprop="channelId" content="([^"]+)"/);
          if (itemPropMatch) {
            channelId = itemPropMatch[1];
          }
        }
      }
    }

    if (!channelId) {
      throw new Error('Could not find channelId in page metadata');
    }

    // Try finding channel name
    let channelName = '';
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (titleMatch) {
      channelName = decodeXml(titleMatch[1]);
    } else {
      const pageTitleMatch = html.match(/<title>(.*?)<\/title>/);
      if (pageTitleMatch) {
        channelName = decodeXml(pageTitleMatch[1]).replace(' - YouTube', '');
      } else {
        channelName = handle;
      }
    }

    res.json({ name: channelName, id: channelId });
  } catch (err) {
    console.error(`[Backend Proxy] Resolve YouTube Channel Error for ${urlOrHandle}:`, err);
    res.status(500).json({ error: 'Failed to resolve YouTube channel', details: err.message });
  }
});


// Dynamic port configuration (supports '-l' flag mapping or default 3000)
let port = 3000;
const lIndex = process.argv.indexOf('-l');
if (lIndex !== -1 && process.argv[lIndex + 1]) {
  port = parseInt(process.argv[lIndex + 1], 10) || 3000;
} else if (process.env.PORT) {
  port = parseInt(process.env.PORT, 10) || 3000;
}

app.listen(port, () => {
  console.log(`===================================================`);
  console.log(`🔮 투챙이 KIS Broker Proxy Server listening on port ${port}`);
  console.log(`===================================================`);
});
