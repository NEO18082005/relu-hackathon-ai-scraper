export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { botToken, channelId, applicantName, applicantEmail, companyName, companyWebsite, pdfBase64 } = await request.json();

    if (!botToken || !channelId) {
      return Response.json({ success: false, error: 'Bot token and channel ID are required' }, { status: 400 });
    }

    const embed = {
      title: '📊 Company Research Report',
      color: 0xEAB54D,
      fields: [
        { name: '👤 Applicant Name', value: applicantName || 'N/A', inline: true },
        { name: '📧 Applicant Email', value: applicantEmail || 'N/A', inline: true },
        { name: '\u200B', value: '\u200B', inline: false },
        { name: '🏢 Company Name', value: companyName || 'N/A', inline: true },
        { name: '🌐 Company Website', value: companyWebsite || 'N/A', inline: true },
      ],
      footer: { text: 'Company Research Assistant • AI-Powered Intelligence' },
      timestamp: new Date().toISOString(),
    };

    const pdfBinary = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    const payloadJson = JSON.stringify({
      embeds: [embed],
    });

    const parts: Uint8Array[] = [];
    const te = new TextEncoder();

    parts.push(te.encode(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${payloadJson}\r\n`));

    const fileName = `${(companyName || 'company').replace(/[^a-zA-Z0-9]/g, '_')}_Research_Report.pdf`;
    parts.push(te.encode(`--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`));
    parts.push(pdfBinary);
    parts.push(te.encode(`\r\n--${boundary}--\r\n`));

    const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    if (!discordResponse.ok) {
      const errText = await discordResponse.text();
      return Response.json({ success: false, error: `Discord API error: ${errText}` }, { status: discordResponse.status });
    }

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send to Discord';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
