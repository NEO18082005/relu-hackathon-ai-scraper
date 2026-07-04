'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CompanyReport, ResearchEntry, AppConfig } from '@/app/types';

const STEP_LABELS = [
  'Searching Serper.dev for official website',
  'Crawling key pages — home, about, products, pricing',
  'Cross-referencing public sources',
  'Sending extracted content to OpenRouter',
  'Generating AI insights & identifying competitors',
];

const EXAMPLE_COMPANIES = ['notion.so', 'Figma', 'Linear', 'Vercel', 'Stripe'];

interface ModelOption {
  id: string;
  name: string;
}

export default function Home() {
  const [config, setConfig] = useState<AppConfig>({
    openrouterKey: '',
    serperKey: '',
    model: 'anthropic/claude-sonnet-4',
    botToken: '',
    channelId: '',
    applicantName: '',
    applicantEmail: '',
    apiSaved: false,
    discordSaved: false,
  });

  const [sidebarTab, setSidebarTab] = useState<'api' | 'discord'>('api');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [queryText, setQueryText] = useState('');
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use ref for entries to avoid stale closures in streaming callbacks
  const entriesRef = useRef<ResearchEntry[]>([]);

  const showLanding = entries.length === 0;

  // Keep entriesRef in sync
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Load saved config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cra-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openrouterKey: config.openrouterKey }),
      });
      const data = await res.json();
      if (data.models) setModels(data.models);
    } catch { /* use defaults */ }
  };

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3000);
  }, []);

  const saveApiConfig = () => {
    const updated = { ...config, apiSaved: true };
    setConfig(updated);
    try { localStorage.setItem('cra-config', JSON.stringify(updated)); } catch { /* ignore */ }
    showToast('API configuration saved ✓');
    fetchModels();
  };

  const saveDiscordConfig = () => {
    const updated = { ...config, discordSaved: true };
    setConfig(updated);
    try { localStorage.setItem('cra-config', JSON.stringify(updated)); } catch { /* ignore */ }
    showToast('Discord configuration saved ✓');
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    }, 50);
  };

  const updateEntry = useCallback((id: string, patch: Partial<ResearchEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const attemptResearch = (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;
    if (!config.apiSaved || !config.openrouterKey.trim() || !config.serperKey.trim()) {
      setShowConfigWarning(true);
      setSidebarTab('api');
      setMobileOpen(true);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setShowConfigWarning(false), 3200);
      return;
    }
    startResearch(query);
  };

  const runStreamingResearch = async (id: string, query: string) => {
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          openrouterKey: config.openrouterKey,
          serperKey: config.serperKey,
          model: config.model,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: 'Request failed' }));
        updateEntry(id, { status: 'error', error: errData.message || 'Research request failed' });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        updateEntry(id, { status: 'error', error: 'Unable to read response stream' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'progress') {
              updateEntry(id, { stepIndex: event.step });
              scrollToBottom();
            } else if (event.type === 'result') {
              updateEntry(id, {
                status: 'done',
                stepIndex: STEP_LABELS.length,
                data: event.data,
              });
              scrollToBottom();
              handleDiscordAutoSend(id, event.data);
            } else if (event.type === 'error') {
              updateEntry(id, { status: 'error', error: event.message });
            }
          } catch { /* skip invalid JSON lines */ }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') {
            updateEntry(id, { status: 'done', stepIndex: STEP_LABELS.length, data: event.data });
            handleDiscordAutoSend(id, event.data);
          } else if (event.type === 'error') {
            updateEntry(id, { status: 'error', error: event.message });
          }
        } catch { /* ignore */ }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error occurred';
      updateEntry(id, { status: 'error', error: message });
    }
  };

  const startResearch = async (query: string) => {
    const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const entry: ResearchEntry = {
      id,
      query,
      status: 'researching',
      stepIndex: 0,
      data: null,
      error: null,
      discordStatus: 'idle',
    };
    setEntries(prev => [...prev, entry]);
    setQueryText('');
    setMobileOpen(false);
    scrollToBottom();
    runStreamingResearch(id, query);
  };

  const retryEntry = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    updateEntry(id, { status: 'researching', stepIndex: 0, error: null, data: null, discordStatus: 'idle' });
    runStreamingResearch(id, entry.query);
  };

  const handleDiscordAutoSend = async (id: string, data: CompanyReport) => {
    if (!config.discordSaved || !config.botToken.trim() || !config.channelId.trim()) {
      updateEntry(id, { discordStatus: 'not_connected' });
      return;
    }
    updateEntry(id, { discordStatus: 'sending' });

    try {
      const pdfBase64 = await generatePdfBase64(data);
      const res = await fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: config.botToken,
          channelId: config.channelId,
          applicantName: config.applicantName,
          applicantEmail: config.applicantEmail,
          companyName: data.companyName,
          companyWebsite: data.website,
          pdfBase64,
        }),
      });
      if (res.ok) {
        updateEntry(id, { discordStatus: 'sent' });
      } else {
        updateEntry(id, { discordStatus: 'error' });
      }
    } catch {
      updateEntry(id, { discordStatus: 'error' });
    }
  };

  // PDF Generation helper
  const buildPdf = async (data: CompanyReport) => {
    const { jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    // Header bar
    doc.setFillColor(14, 15, 21);
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setTextColor(234, 181, 77);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName, margin, 25);
    doc.setFontSize(10);
    doc.setTextColor(156, 160, 170);
    doc.text(`Company Research Report • Generated ${new Date().toLocaleDateString()}`, margin, 35);
    y = 55;

    // Company Information
    doc.setTextColor(112, 117, 240);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPANY INFORMATION', margin, y);
    y += 5;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).autoTable({
      startY: y,
      head: [['Field', 'Details']],
      body: [
        ['Company Name', data.companyName],
        ['Website', data.website],
        ['Phone', data.phone || 'Not publicly listed'],
        ['Address', data.address || 'Not publicly listed'],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 5, textColor: [200, 200, 210] },
      headStyles: { fillColor: [30, 32, 42], textColor: [234, 181, 77], fontStyle: 'bold' },
      bodyStyles: { fillColor: [20, 22, 32] },
      alternateRowStyles: { fillColor: [25, 27, 37] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 12;

    // Company Summary
    if (data.summary) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setTextColor(112, 117, 240);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('COMPANY SUMMARY', margin, y);
      y += 8;
      doc.setTextColor(180, 182, 192);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * 5 + 12;
    }

    // Products & Services
    if (data.products && data.products.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setTextColor(112, 117, 240);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('PRODUCTS & SERVICES', margin, y);
      y += 5;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: y,
        head: [['#', 'Product / Service']],
        body: data.products.map((p: string, i: number) => [String(i + 1), p]),
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 5, textColor: [200, 200, 210] },
        headStyles: { fillColor: [30, 32, 42], textColor: [138, 143, 242], fontStyle: 'bold' },
        bodyStyles: { fillColor: [20, 22, 32] },
        alternateRowStyles: { fillColor: [25, 27, 37] },
        margin: { left: margin, right: margin },
        columnStyles: { 0: { cellWidth: 15, halign: 'center' } },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 12;
    }

    // Pain Points
    if (data.painPoints && data.painPoints.length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }
      doc.setTextColor(234, 181, 77);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('AI-GENERATED PAIN POINTS', margin, y);
      y += 8;
      doc.setTextColor(180, 182, 192);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      data.painPoints.forEach((point: string, i: number) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const lines = doc.splitTextToSize(`${i + 1}. ${point}`, contentWidth - 5);
        doc.text(lines, margin + 2, y);
        y += lines.length * 5 + 4;
      });
      y += 8;
    }

    // Competitors
    if (data.competitors && data.competitors.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setTextColor(112, 117, 240);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('COMPETITOR ANALYSIS', margin, y);
      y += 5;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc as any).autoTable({
        startY: y,
        head: [['#', 'Competitor Name', 'Website']],
        body: data.competitors.map((c: { name: string; website: string }, i: number) => [String(i + 1), c.name, c.website]),
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 5, textColor: [200, 200, 210] },
        headStyles: { fillColor: [30, 32, 42], textColor: [156, 160, 170], fontStyle: 'bold' },
        bodyStyles: { fillColor: [20, 22, 32] },
        alternateRowStyles: { fillColor: [25, 27, 37] },
        margin: { left: margin, right: margin },
        columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 2: { textColor: [124, 143, 247] } },
      });
    }

    // Footer on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(14, 15, 21);
      doc.rect(0, doc.internal.pageSize.getHeight() - 15, pageWidth, 15, 'F');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 110);
      doc.text('Company Research Assistant • AI-Powered Intelligence', margin, doc.internal.pageSize.getHeight() - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, doc.internal.pageSize.getHeight() - 6);
    }

    return doc;
  };

  const generatePdfBase64 = async (data: CompanyReport): Promise<string> => {
    const doc = await buildPdf(data);
    return doc.output('datauristring').split(',')[1];
  };

  const downloadPdf = async (data: CompanyReport) => {
    const doc = await buildPdf(data);
    doc.save(`${data.companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Research_Report.pdf`);
  };

  // Auto-grow textarea
  const autoGrow = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      attemptResearch(queryText);
    }
  };

  const newResearch = () => {
    setEntries([]);
    setQueryText('');
    setMobileOpen(false);
  };

  // Render steps for a researching entry
  const renderSteps = (entry: ResearchEntry) => {
    return STEP_LABELS.map((label, i) => {
      const isDone = entry.stepIndex > i;
      const isActive = entry.stepIndex === i;
      const circleClass = isDone ? 'done' : (isActive ? 'active' : 'pending');
      const labelClass = isDone ? 'done' : (isActive ? 'active' : 'pending');

      return (
        <div className="step-row" key={i}>
          <div className={`step-circle ${circleClass}`}>
            {isDone ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                <path d="M4 12l6 6L20 6" stroke="#0e1a14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : isActive ? (
              <div className="step-spin"></div>
            ) : (
              <span className="step-num">{i + 1}</span>
            )}
          </div>
          <div className={`step-label ${labelClass}`}>{label}</div>
        </div>
      );
    });
  };

  // Render discord pill
  const renderDiscordPill = (entry: ResearchEntry) => {
    const status = entry.discordStatus;
    if (status === 'not_connected') {
      return (
        <div className="discord-pill not-connected">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4m0 4h.01M10.3 3.9L2.7 17.5a1.8 1.8 0 001.55 2.7h15.5a1.8 1.8 0 001.55-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z" stroke="#6b6f78" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="discord-pill-text">Discord not connected</span>
          <button className="discord-configure-link" onClick={() => { setSidebarTab('discord'); setMobileOpen(true); }}>Configure →</button>
        </div>
      );
    }
    if (status === 'sending') {
      return (
        <div className="discord-pill sending">
          <div className="mini-spin"></div>
          <span className="discord-pill-text" style={{ color: '#a5a8f7' }}>Sending report to Discord…</span>
        </div>
      );
    }
    if (status === 'sent') {
      return (
        <div className="discord-pill sent">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 12l6 6L20 6" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="discord-pill-text" style={{ color: '#34d399' }}>Sent to Discord</span>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="discord-pill not-connected">
          <span className="discord-pill-text" style={{ color: '#f8a8a8' }}>Discord send failed</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="app">
      {/* Backdrop for mobile sidebar */}
      <div className={`backdrop ${mobileOpen ? 'visible' : ''}`} onClick={() => setMobileOpen(false)}></div>

      {/* SIDEBAR */}
      <div className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">🔍</div>
            <div>
              <div className="sidebar-brand-name">Research Assistant</div>
              <div className="sidebar-brand-sub">COMPANY INTELLIGENCE</div>
            </div>
          </div>
        </div>

        <div className="new-research-wrap">
          <button className="btn-outline" onClick={newResearch}>
            <span className="plus">+</span> New Research
          </button>
        </div>

        <div className="tabs">
          <button className={`tab-btn ${sidebarTab === 'api' ? 'active' : ''}`} onClick={() => setSidebarTab('api')}>API</button>
          <button className={`tab-btn ${sidebarTab === 'discord' ? 'active' : ''}`} onClick={() => setSidebarTab('discord')}>DISCORD</button>
        </div>

        <div className="sidebar-scroll">
          {sidebarTab === 'api' ? (
            <div>
              <div className="field-label">OPENROUTER API KEY</div>
              <input
                type="password"
                className="field-input mono"
                placeholder="sk-or-v1-..."
                value={config.openrouterKey}
                onChange={(e) => setConfig(prev => ({ ...prev, openrouterKey: e.target.value, apiSaved: false }))}
              />

              <div className="field-label">SERPER.DEV API KEY</div>
              <input
                type="password"
                className="field-input mono"
                placeholder="Your Serper key..."
                value={config.serperKey}
                onChange={(e) => setConfig(prev => ({ ...prev, serperKey: e.target.value, apiSaved: false }))}
              />

              <div className="field-label">AI MODEL</div>
              <select
                className="field-input"
                value={config.model}
                onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
              >
                {models.length > 0 ? (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                ) : (
                  <>
                    <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
                    <option value="anthropic/claude-haiku-4">Claude Haiku 4</option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                    <option value="deepseek/deepseek-chat-v3-0324">DeepSeek Chat V3</option>
                  </>
                )}
              </select>

              <button className="btn-gold" onClick={saveApiConfig}>
                {config.apiSaved ? 'Saved ✓' : 'Save Configuration'}
              </button>
            </div>
          ) : (
            <div>
              <div className="discord-callout">
                <div className="discord-callout-title">Discord Bot Integration</div>
                <div className="discord-callout-body">After research completes, the report auto-sends to your configured channel.</div>
              </div>

              <div className="field-label">BOT TOKEN</div>
              <input
                type="password"
                className="field-input mono"
                placeholder="Bot token..."
                value={config.botToken}
                onChange={(e) => setConfig(prev => ({ ...prev, botToken: e.target.value, discordSaved: false }))}
              />

              <div className="field-label">CHANNEL ID</div>
              <input
                className="field-input mono"
                placeholder="000000000000000000"
                value={config.channelId}
                onChange={(e) => setConfig(prev => ({ ...prev, channelId: e.target.value, discordSaved: false }))}
              />

              <div className="applicant-heading">APPLICANT DETAILS</div>

              <div className="field-label-plain">Full Name</div>
              <input
                className="field-input"
                placeholder="Your full name"
                value={config.applicantName}
                onChange={(e) => setConfig(prev => ({ ...prev, applicantName: e.target.value, discordSaved: false }))}
              />

              <div className="field-label-plain">Email Address</div>
              <input
                className="field-input"
                placeholder="email@example.com"
                value={config.applicantEmail}
                onChange={(e) => setConfig(prev => ({ ...prev, applicantEmail: e.target.value, discordSaved: false }))}
              />

              <button className="btn-purple" onClick={saveDiscordConfig}>
                {config.discordSaved ? 'Saved ✓' : 'Save Discord Config'}
              </button>
            </div>
          )}

          <div className="how-it-works">
            <div className="how-it-works-title">HOW IT WORKS</div>
            {[
              'Enter a company name or URL',
              'Serper.dev searches and crawls it',
              'OpenRouter AI generates insights',
              'Download a professional PDF report',
            ].map((step, i) => (
              <div className="how-step" key={i}>
                <div className="how-step-num">{i + 1}</div>
                <div className="how-step-label">{step}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-foot-text">OPENROUTER · SERPER · JSPDF</div>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button className="mobile-toggle" onClick={() => setMobileOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="topbar-title">Company Research</div>
          <div className="live-badge">
            <div className="live-dot"></div>
            <span className="live-text">LIVE</span>
          </div>
        </div>

        <div className="content" ref={contentRef}>
          {showLanding ? (
            <div className="landing">
              <div className="landing-eyebrow">AI-POWERED INTELLIGENCE</div>
              <div className="landing-title">Know any company<br/>in minutes.</div>
              <div className="landing-sub">Enter a company name or website URL to get AI-powered insights, competitor analysis, pain points, and a professional PDF report.</div>
              <div className="example-row">
                {EXAMPLE_COMPANIES.map(name => (
                  <button key={name} className="example-chip" onClick={() => attemptResearch(name)}>{name}</button>
                ))}
              </div>
              <div className="landing-hint">
                <div className="rule"></div>
                <span>{config.apiSaved ? 'Ready — press Research to begin' : 'Configure API keys in the sidebar to get started'}</span>
                <div className="rule"></div>
              </div>
            </div>
          ) : (
            <div className="entries">
              {entries.map(entry => (
                <div className="entry" key={entry.id}>
                  <div className="entry-query-row">
                    <div className="entry-query-bubble">{entry.query}</div>
                  </div>

                  {entry.status === 'researching' && (
                    <div className="researching-card">
                      <div className="researching-title">RESEARCHING · {entry.query}</div>
                      {renderSteps(entry)}
                    </div>
                  )}

                  {entry.status === 'error' && (
                    <div className="error-card">
                      <div className="error-text">{entry.error || 'An error occurred'}</div>
                      <button className="retry-btn" onClick={() => retryEntry(entry.id)}>Retry</button>
                    </div>
                  )}

                  {entry.status === 'done' && entry.data && (
                    <div className="report-card">
                      <div className="report-head">
                        <div>
                          <div className="report-company-name">{entry.data.companyName}</div>
                          <a className="report-website" href={entry.data.website} target="_blank" rel="noopener noreferrer">{entry.data.website}</a>
                        </div>
                        <div className="report-complete-badge">✓ RESEARCH COMPLETE</div>
                      </div>

                      <div className="report-grid">
                        <div className="report-stat">
                          <div className="report-stat-label">PHONE</div>
                          <div className="report-stat-value">{entry.data.phone || 'Not publicly listed'}</div>
                        </div>
                        <div className="report-stat">
                          <div className="report-stat-label">ADDRESS</div>
                          <div className="report-stat-value">{entry.data.address || 'Not publicly listed'}</div>
                        </div>
                      </div>

                      {entry.data.summary && (
                        <div className="report-section">
                          <div className="report-section-title summary">COMPANY SUMMARY</div>
                          <div className="summary-text">{entry.data.summary}</div>
                        </div>
                      )}

                      {entry.data.products && entry.data.products.length > 0 && (
                        <div className="report-section">
                          <div className="report-section-title products">PRODUCTS & SERVICES</div>
                          <div className="chip-row">
                            {entry.data.products.map((p, i) => (
                              <span key={i} className="product-chip">{p}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.data.painPoints && entry.data.painPoints.length > 0 && (
                        <div className="report-section">
                          <div className="report-section-title pain">AI-GENERATED PAIN POINTS</div>
                          {entry.data.painPoints.map((point, i) => (
                            <div className="pain-row" key={i}>
                              <div className="pain-dot"></div>
                              <div className="pain-text">{point}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {entry.data.competitors && entry.data.competitors.length > 0 && (
                        <div className="report-section">
                          <div className="report-section-title competitors">COMPETITORS</div>
                          <div className="competitor-grid">
                            {entry.data.competitors.map((c, i) => (
                              <div className="competitor-card" key={i}>
                                <div className="competitor-name">{c.name}</div>
                                <a className="competitor-site" href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="report-actions">
                        <button className="download-btn" onClick={() => downloadPdf(entry.data!)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Download PDF
                        </button>
                        {renderDiscordPill(entry)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="footer">
          <div className={`config-warning ${showConfigWarning ? 'visible' : ''}`}>
            Add and save your OpenRouter &amp; Serper.dev API keys in the sidebar before researching.
          </div>
          <div className="input-row">
            <textarea
              ref={textareaRef}
              className="query-input"
              rows={1}
              placeholder="Enter a company name (e.g. Stripe) or website URL (e.g. https://stripe.com)..."
              value={queryText}
              onChange={(e) => { setQueryText(e.target.value); autoGrow(); }}
              onKeyDown={handleKeyDown}
            />
            <button
              className={`submit-btn ${!queryText.trim() ? 'dim' : ''}`}
              onClick={() => attemptResearch(queryText)}
            >
              Research <span style={{ marginLeft: 2 }}>→</span>
            </button>
          </div>
          <div className="footer-hint">ENTER TO RESEARCH · SHIFT+ENTER FOR NEW LINE</div>
        </div>
      </div>

      {/* Toast */}
      {toastVisible && (
        <div className="toast">{toastMessage}</div>
      )}
    </div>
  );
}
