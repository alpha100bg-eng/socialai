/**
 * Wan2GP client — wraps the local Wan2GP / Gradio REST API.
 *
 * Set WAN2GP_URL in .env.local (e.g. http://localhost:7860).
 * If unset, callers fall back to fal.ai automatically.
 *
 * Job IDs returned here are prefixed "wan2gp:" so the status
 * route can tell which provider to query.
 */

export const WAN2GP_URL = process.env.WAN2GP_URL?.replace(/\/$/, '') ?? '';

export interface Wan2GPJob {
  jobId:    string; // "wan2gp:<event_id>"
  provider: 'wan2gp';
}

export interface Wan2GPStatus {
  status:   'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  videoUrl?: string;
  error?:    string;
}

// ─── Gradio queue API ─────────────────────────────────────────────────────────
// Wan2GP exposes a Gradio 4.x API at /queue/join and /queue/status/{event_id}.
// fn_index 0 = text-to-video (first predict function exposed in the app).
// Adjust fn_index if the Wan2GP version you're running differs.

const FN_INDEX = 0; // text-to-video generation endpoint

function eventId(jobId: string): string {
  return jobId.replace(/^wan2gp:/, '');
}

export async function submitWan2GPVideo(
  prompt: string,
  aspectRatio: '9:16' | '16:9',
  durationSeconds = 5,
): Promise<Wan2GPJob> {
  if (!WAN2GP_URL) throw new Error('WAN2GP_URL is not set');

  const sessionHash = Math.random().toString(36).slice(2, 10);

  const res = await fetch(`${WAN2GP_URL}/queue/join`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fn_index:     FN_INDEX,
      session_hash: sessionHash,
      data: [
        prompt,                    // positive prompt
        '',                        // negative prompt
        aspectRatio === '9:16' ? 832 : 1280,  // width
        aspectRatio === '9:16' ? 1280 : 832,  // height
        durationSeconds,           // duration in seconds
        1,                         // num videos
        25,                        // num inference steps
        7.0,                       // guidance scale
        -1,                        // seed (-1 = random)
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Wan2GP submit failed (${res.status}): ${txt}`);
  }

  const json = await res.json() as { event_id?: string };
  if (!json.event_id) throw new Error(`Wan2GP returned no event_id: ${JSON.stringify(json)}`);

  return { jobId: `wan2gp:${json.event_id}`, provider: 'wan2gp' };
}

export async function getWan2GPStatus(jobId: string): Promise<Wan2GPStatus> {
  if (!WAN2GP_URL) throw new Error('WAN2GP_URL is not set');

  const id  = eventId(jobId);
  const res = await fetch(`${WAN2GP_URL}/queue/status/${id}`);

  if (!res.ok) {
    return { status: 'FAILED', error: `Status check failed (${res.status})` };
  }

  const json = await res.json() as {
    status?: string;          // "waiting" | "processing" | "complete" | "error"
    output?: { data?: unknown[] };
    error?:  string;
  };

  const raw = json.status ?? '';

  if (raw === 'complete') {
    // Gradio returns output.data as an array; first element is the video file object or URL
    const data    = json.output?.data ?? [];
    const first   = data[0] as { url?: string; name?: string } | string | undefined;
    const videoUrl = typeof first === 'string'
      ? first
      : (first as { url?: string })?.url ?? '';

    // Prefix with base URL if the path is relative
    const fullUrl = videoUrl.startsWith('http')
      ? videoUrl
      : `${WAN2GP_URL}/file=${videoUrl}`;

    return { status: 'COMPLETED', videoUrl: fullUrl };
  }

  if (raw === 'error') return { status: 'FAILED', error: json.error ?? 'Unknown Wan2GP error' };
  if (raw === 'processing') return { status: 'IN_PROGRESS' };
  return { status: 'IN_QUEUE' };
}
