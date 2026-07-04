import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Company Research Assistant — AI-Powered Intelligence',
  description: 'Research any company with AI-powered insights, competitor analysis, and professional PDF reports. Enter a company name or website URL to get started.',
  keywords: 'company research, AI analysis, competitor analysis, business intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
