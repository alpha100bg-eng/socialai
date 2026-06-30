/**
 * GET /api/admin/debug-shot?name=nav|fail
 *
 * Sert une capture d'écran de debug (debug-nav.png / debug-fail.png) écrite
 * par lib/tiktok-browser.ts sur le volume /data. Sert à diagnostiquer ce que
 * TikTok affiche sur le serveur. Protégé par ADMIN_UPLOAD_SECRET.
 *
 * À supprimer une fois le diagnostic terminé.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { dataPath } from '@/lib/data-dir';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_UPLOAD_SECRET;
  const auth   = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const name  = new URL(req.url).searchParams.get('name') || 'fail';
  const files: Record<string, string> = {
    nav:       'debug-nav.png',
    upload:    'debug-upload.png',
    fail:      'debug-fail.png',
    analytics: 'debug-analytics.png',
  };
  const file = files[name] ?? 'debug-fail.png';
  const p    = dataPath(file);

  try {
    const buf = fs.readFileSync(p);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: `Pas de capture ${file}` }, { status: 404 });
  }
}
