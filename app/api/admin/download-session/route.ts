/**
 * GET /api/admin/download-session?profileId=animals
 *
 * Renvoie le fichier de session TikTok du profil, pour que le robot GitHub
 * Actions puisse l'utiliser afin de poster (PC éteint, 24/7).
 * Protégé par ADMIN_UPLOAD_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { dataPath, IS_VERCEL } from '@/lib/data-dir';
import { DEFAULT_NICHE } from '@/lib/niches';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_UPLOAD_SECRET;
  const auth   = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profileId = new URL(req.url).searchParams.get('profileId') || DEFAULT_NICHE;
  const suffix    = profileId === DEFAULT_NICHE ? '' : `-${profileId}`;
  const file      = `tiktok-session${suffix}.json`;
  const p         = IS_VERCEL ? `/tmp/${file}` : dataPath(file);

  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return new NextResponse(raw, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: `Session introuvable pour ${profileId}` }, { status: 404 });
  }
}
