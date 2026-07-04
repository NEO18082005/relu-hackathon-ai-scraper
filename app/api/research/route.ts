export const runtime = 'edge';

import { CompanyReport } from '@/app/types';

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

interface SerperResponse {
  organic?: SerperResult[];
  knowledgeGraph?: {
    title?: string;
    website?: string;
    phone?: string;
    address?: string;
    description?: string;
  };
}

function looksLikeUrl(q: string): boolean {
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(q.trim());
}

function normalizeUrl(q: string): string {
  const trimmed = q.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/i, '').split(/[/?#]/)[0];
  }
}

function deriveCompanyName(domain: string): string {
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function stripHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const linkRegex = /href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match;
  const base = new URL(baseUrl);

  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1];
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname === base.hostname) {
        links.push(resolved.origin + resolved.pathname);
      }
    } catch { /* skip invalid URLs */ }
  }
  return [...new Set(links)];
}

function isRelevantPage(url: string): boolean {
  const path = url.toLowerCase();
  const relevant = ['about', 'product', 'service', 'solution', 'contact', 'pricing', 'price', 'team', 'company', 'platform', 'feature', 'overview'];
  const irrelevant = ['login', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'auth', 'account', 'dashboard', 'blog/', 'news/', 'press/', 'legal', 'privacy', 'terms', 'cookie', 'career', 'job', 'support/ticket', '.pdf', '.jpg', '.png', '.svg', '.gif', '.zip', '.xml', '.json'];

  if (irrelevant.some(term => path.includes(term))) return false;
  if (relevant.some(term => path.includes(term))) return true;
  const pathname = new URL(url).pathname;
  const segments = pathname.split('/').filter(Boolean);
  return segments.length <= 1;
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    if (!response.ok) return '';
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return '';
    const text = await response.text();
    if (text.length < 100) return '';
    return text;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function searchSerper(query: string, apiKey: string, num = 10): Promise<SerperResponse> {
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Serper API error ${response.status}: ${errText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Serper search error:', error);
    return {};
  }
}

async function crawlWebsite(baseUrl: string): Promise<{ pages: { url: string; content: string }[] }> {
  const pages: { url: string; content: string }[] = [];
  const visited = new Set<string>();
  const maxPages = 8;

  const homepage = await fetchPage(baseUrl);
  if (homepage) {
    visited.add(baseUrl);
    const content = stripHtml(homepage);
    if (content.length > 50) {
      pages.push({ url: baseUrl, content: content.slice(0, 5000) });
    }

    const links = extractLinks(homepage, baseUrl);
    const relevantLinks = links.filter(link => !visited.has(link) && isRelevantPage(link));
    const toVisit = relevantLinks.slice(0, maxPages - 1);

    const results = await Promise.allSettled(
      toVisit.map(async (link) => {
        if (visited.has(link)) return null;
        visited.add(link);
        const html = await fetchPage(link);
        if (!html) return null;
        const text = stripHtml(html);
        if (text.length < 50) return null;
        return { url: link, content: text.slice(0, 3000) };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        pages.push(result.value);
      }
    }
  }

  return { pages };
}

async function analyzeWithAI(
  companyName: string,
  website: string,
  crawledData: string,
  searchData: string,
  contactInfo: { phone: string; address: string },
  openrouterKey: string,
  model: string
): Promise<CompanyReport> {
  const systemPrompt = `You are a company research analyst. Analyze the provided information about a company and generate a comprehensive research report.

You MUST respond with valid JSON only, no markdown, no code blocks, no extra text. The JSON must match this exact structure:
{
  "companyName": "Official Company Name",
  "website": "https://company.com",
  "phone": "Phone number or 'Not publicly listed'",
  "address": "Address or 'Not publicly listed'",
  "summary": "A comprehensive 3-5 sentence summary of the company, its mission, key offerings, and market position.",
  "products": ["Product 1", "Product 2", "Product 3"],
  "painPoints": [
    "Pain point 1 - a detailed sentence about a business challenge",
    "Pain point 2 - a detailed sentence about a business challenge",
    "Pain point 3 - a detailed sentence about a business challenge",
    "Pain point 4 - a detailed sentence about a business challenge"
  ],
  "competitors": [
    {"name": "Competitor 1", "website": "https://competitor1.com"},
    {"name": "Competitor 2", "website": "https://competitor2.com"},
    {"name": "Competitor 3", "website": "https://competitor3.com"},
    {"name": "Competitor 4", "website": "https://competitor4.com"}
  ]
}

IMPORTANT RULES for competitors:
- Identify competitors operating in the SAME COUNTRY as the company
- Identify competitors in the SAME INDUSTRY
- Identify competitors offering SIMILAR PRODUCTS or SERVICES
- Use real, actual competitor companies with their real websites
- Provide at least 3-4 competitors

IMPORTANT RULES for pain points:
- Generate 3-5 realistic, insightful business pain points
- Each pain point should be a complete, detailed sentence
- Focus on business challenges, market pressures, operational difficulties

IMPORTANT RULES for products:
- List the main products or services the company offers
- Use concise names (2-5 words each)
- List 3-6 products/services`;

  const userPrompt = `Research this company and generate the report:

Company Name: ${companyName}
Website: ${website}

--- CRAWLED WEBSITE DATA ---
${crawledData.slice(0, 12000)}

--- SEARCH ENGINE DATA ---
${searchData.slice(0, 4000)}

--- CONTACT INFORMATION FOUND ---
Phone: ${contactInfo.phone}
Address: ${contactInfo.address}

Generate the JSON report now.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://company-research-assistant.vercel.app',
        'X-Title': 'Company Research Assistant',
      },
      body: JSON.stringify({
        model: model || 'anthropic/claude-sonnet-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      companyName: parsed.companyName || companyName,
      website: parsed.website || website,
      phone: parsed.phone || contactInfo.phone || 'Not publicly listed',
      address: parsed.address || contactInfo.address || 'Not publicly listed',
      summary: parsed.summary || 'Company information is being compiled.',
      products: Array.isArray(parsed.products) ? parsed.products : [],
      painPoints: Array.isArray(parsed.painPoints) ? parsed.painPoints : [],
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.map((c: { name?: string; website?: string }) => ({
        name: c.name || 'Unknown',
        website: c.website || '#',
      })) : [],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI analysis timed out. Please try a faster model.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, openrouterKey, serperKey, model } = body;

    if (!query || !openrouterKey || !serperKey) {
      return new Response(
        JSON.stringify({ type: 'error', message: 'Missing required fields: query, openrouterKey, serperKey' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(event: object) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        }

        try {
          let companyName = '';
          let website = '';

          // Step 1: Search for official website
          sendEvent({ type: 'progress', step: 0, message: 'Searching Serper.dev for official website...' });

          if (looksLikeUrl(query)) {
            website = normalizeUrl(query);
            const domain = extractDomain(website);
            companyName = deriveCompanyName(domain);

            const searchResult = await searchSerper(`${domain} company`, serperKey);
            if (searchResult.knowledgeGraph?.title) {
              companyName = searchResult.knowledgeGraph.title;
            }
          } else {
            const searchResult = await searchSerper(`${query} official website`, serperKey);
            companyName = query;

            if (searchResult.knowledgeGraph?.website) {
              website = searchResult.knowledgeGraph.website;
              if (searchResult.knowledgeGraph.title) {
                companyName = searchResult.knowledgeGraph.title;
              }
            } else if (searchResult.organic && searchResult.organic.length > 0) {
              website = searchResult.organic[0].link;
            } else {
              website = `https://www.${query.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
            }
          }

          // Step 2: Crawl the website
          sendEvent({ type: 'progress', step: 1, message: `Crawling key pages on ${extractDomain(website)}...` });

          const crawlResult = await crawlWebsite(website);
          const crawledData = crawlResult.pages
            .map(p => `--- Page: ${p.url} ---\n${p.content}`)
            .join('\n\n');

          // Step 3: Search for additional info
          sendEvent({ type: 'progress', step: 2, message: 'Cross-referencing public sources...' });

          const [contactSearch, infoSearch] = await Promise.all([
            searchSerper(`${companyName} contact phone address headquarters`, serperKey, 5),
            searchSerper(`${companyName} company products services overview`, serperKey, 5),
          ]);

          const contactInfo = {
            phone: contactSearch.knowledgeGraph?.phone || 'Not publicly listed',
            address: contactSearch.knowledgeGraph?.address || 'Not publicly listed',
          };

          const searchData = [
            ...(infoSearch.organic || []).map(r => `${r.title}: ${r.snippet}`),
            ...(contactSearch.organic || []).map(r => `${r.title}: ${r.snippet}`),
          ].join('\n');

          // Step 4: Send to OpenRouter
          sendEvent({ type: 'progress', step: 3, message: 'Sending data to OpenRouter for AI analysis...' });

          // Step 5: Generate AI insights
          sendEvent({ type: 'progress', step: 4, message: 'Generating AI insights & identifying competitors...' });

          const report = await analyzeWithAI(
            companyName,
            website,
            crawledData,
            searchData,
            contactInfo,
            openrouterKey,
            model
          );

          sendEvent({ type: 'result', data: report });

        } catch (error) {
          const message = error instanceof Error ? error.message : 'An unexpected error occurred during research.';
          sendEvent({ type: 'error', message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process request';
    return new Response(
      JSON.stringify({ type: 'error', message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
