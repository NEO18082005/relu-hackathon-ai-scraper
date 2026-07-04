# 🔍 Company Research Assistant

**AI-Powered Company Intelligence Platform**

Research any company by providing a company name or website URL. The application automatically gathers information from company websites and public sources, analyzes data using AI, identifies competitors, and generates professional downloadable PDF reports.

![Company Research Assistant](https://img.shields.io/badge/Next.js-14-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript) ![OpenRouter](https://img.shields.io/badge/OpenRouter-AI-purple) ![Serper](https://img.shields.io/badge/Serper.dev-Search-green)

---

## ✨ Features

### Core Features
- **Company Research** — Support for both company names and website URLs
- **Website Crawling** — Intelligent page discovery with duplicate detection and content extraction
- **Serper.dev Integration** — Search engine integration for enriched company data
- **OpenRouter AI Analysis** — Generate company summaries, pain points, and insights
- **Competitor Analysis** — Identify competitors in the same country, industry, and product space
- **PDF Report Generation** — Professional, downloadable reports with all research data
- **ChatGPT-style Interface** — Modern conversational UI with streaming progress

### Bonus Features
- **AI Model Selection** — Choose from any OpenRouter-supported model
- **Discord Integration** — Auto-send reports to Discord channels
- **Responsive Design** — Mobile and desktop friendly
- **Real-time Progress** — Streaming progress indicators for each research step
- **Error Recovery** — Retry failed research with one click

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Vanilla CSS (Premium Dark Theme) |
| AI | OpenRouter API |
| Search | Serper.dev API |
| Crawling | Edge Runtime + fetch + regex parsing |
| PDF | jsPDF + jspdf-autotable |
| Fonts | Space Grotesk, Inter, JetBrains Mono |
| Deployment | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn
- API keys for:
  - [OpenRouter](https://openrouter.ai/keys) (AI processing)
  - [Serper.dev](https://serper.dev/) (Search integration)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd company-research-assistant

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open https://company-intel-21.preview.emergentagent.com/ in your browser.

### Configuration

1. Open the application in your browser
2. In the left sidebar, enter your **OpenRouter API Key** and **Serper.dev API Key**
3. Select your preferred AI model from the dropdown
4. Click **Save Configuration**
5. Start researching companies!

---

## 🔑 Environment Variables

This application does **not** require server-side environment variables. All API keys are entered by users in the UI sidebar and passed per-request to the API routes.

| Key | Where to Get | Purpose |
|---|---|---|
| OpenRouter API Key | [openrouter.ai/keys](https://openrouter.ai/keys) | AI analysis and insights |
| Serper.dev API Key | [serper.dev](https://serper.dev/) | Google search integration |
| Discord Bot Token | [Discord Developer Portal](https://discord.com/developers) | Optional: Send reports to Discord |
| Discord Channel ID | Right-click channel → Copy ID | Optional: Target Discord channel |

---

## 📂 Project Structure

```
company-research-assistant/
├── app/
│   ├── api/
│   │   ├── research/route.ts   # Main research orchestration (streaming)
│   │   ├── models/route.ts     # OpenRouter model list proxy
│   │   └── discord/route.ts    # Discord message sender
│   ├── globals.css             # Complete design system
│   ├── layout.tsx              # Root layout with fonts & SEO
│   ├── page.tsx                # Main application component
│   └── types.ts                # TypeScript interfaces
├── .env.example                # Environment variable documentation
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔄 Research Workflow

1. **User Input** → Company name or website URL
2. **Serper.dev Search** → Find official website (if name provided)
3. **Website Crawling** → Discover and parse key pages (home, about, products, services, contact, pricing)
4. **Additional Search** → Collect contact info, public data from search results
5. **OpenRouter AI** → Analyze all collected data, generate structured insights
6. **Report Display** → Show results in the chat interface
7. **PDF Generation** → One-click downloadable professional report
8. **Discord Send** → Auto-send to configured Discord channel (optional)

---

## 🌐 API Routes

### `POST /api/research`
Main research endpoint with streaming NDJSON responses.

**Request:**
```json
{
  "query": "Stripe",
  "openrouterKey": "sk-or-v1-...",
  "serperKey": "...",
  "model": "anthropic/claude-sonnet-4"
}
```

**Streaming Response (NDJSON):**
```
{"type":"progress","step":0,"message":"Searching Serper.dev..."}
{"type":"progress","step":1,"message":"Crawling key pages..."}
{"type":"progress","step":2,"message":"Cross-referencing sources..."}
{"type":"progress","step":3,"message":"Sending to OpenRouter..."}
{"type":"progress","step":4,"message":"Generating insights..."}
{"type":"result","data":{...CompanyReport}}
```

### `POST /api/models`
Fetches available AI models from OpenRouter.

### `POST /api/discord`
Sends research report with PDF to Discord channel.

---

## 📋 Website Crawling

The crawler:
- Starts from the homepage and extracts internal links
- Filters for relevant pages: about, products, services, solutions, contact, pricing
- Ignores: login pages, signup, auth, dashboard, blog, legal, privacy
- Strips HTML tags, scripts, styles, nav, footer to extract meaningful content
- Limits to 8 pages max for efficiency
- 8-second timeout per page to handle anti-bot protection
- Falls back to Serper.dev data if crawling fails

---

## 📄 PDF Report Contents

- Company header with name and generation date
- Company Information table (name, website, phone, address)
- Company Summary paragraph
- Products & Services table
- AI-Generated Pain Points (numbered list)
- Competitor Analysis table (name, website)
- Page numbers and footer branding

---

## 🚢 Deployment

### Emergent

```bash
# Install emergent CLI
npm i -g emergent

# Deploy
emergent
```

Or connect your GitHub repository to Vercel for automatic deployments.

The application uses Edge Runtime for API routes, ensuring compatibility with Vercel's serverless function limits.

---

## 📝 License

MIT License
