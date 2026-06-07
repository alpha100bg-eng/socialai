/**
 * One-time admin endpoint to upload the local TikTok browser session
 * (data/tiktok-session.json) to a remote server (e.g. Railway with a
 * persistent volume), since the file is gitignored and too large for
 * an environment variable.
 *
 * Protected by ADMIN_UPLOAD_SECRET — set this in Railway, call the
 * endpoint once, then remove the variable (or delete this route).
 *
 * Usage (PowerShell):
 *   $body = Get-Content data\tiktok-session.json -Raw
 *   Invoke-RestMethod -Uri "https://<railway-url>/api/admin/upload-session" `
 *     -Method POST -Headers @{ "Authorization" = "Bearer <ADMIN_UPLOAD_SECRET>" } `
 *     -ContentType "application/json" -Body $body
 */

import { NextRequest, NextResponse } from 'next/server';
import fs   from 'fs';
import path from 'path';
import { dataPath, IS_VERCEL } from '@/lib/data-dir';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_UPLOAD_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ADMIN_UPLOAD_SECRET is not configured on the server' }, { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const raw = await req.text();
    // Validate it's parseable JSON with the expected shape before writing
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'Invalid session JSON' }, { status: 400 });
    }

    const dest = IS_VERCEL ? '/tmp/tiktok-session.json' : dataPath('tiktok-session.json');

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(parsed), 'utf-8');

    return NextResponse.json({ success: true, path: dest, bytes: raw.length });
  } catch (e) {
    console.error('[admin/upload-session]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
