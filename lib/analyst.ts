/**
 * Robot Analytics — cerveau d'optimisation TikTok (powered by Groq).
 *
 * À partir des performances réelles (vues/likes/commentaires/partages) des
 * vidéos passées, produit un diagnostic + des DIRECTIVES concrètes pour la
 * prochaine vidéo. Ces directives sont stockées en mémoire et réinjectées
 * dans la génération de contenu → amélioration continue.
 */

import type { NicheConfig } from './niches';

export interface PerfLine {
  topic:    string;
  hook?:    string;
  views:    number;
  likes:    number;
  comments: number;
  shares:   number;
}

/**
 * Prompt "Robot Analytics" : analyse les perfs et sort des directives JSON.
 */
export function buildAnalystPrompt(niche: NicheConfig, perf: PerfLine[]): string {
  const table = perf.length
    ? perf.map((p, i) =>
        `${i + 1}. "${p.topic.slice(0, 70)}" → ${p.views} vues, ${p.likes} likes, ${p.comments} comm., ${p.shares} partages`,
      ).join('\n')
    : '(aucune donnée encore — base-toi sur les bonnes pratiques de viralité TikTok)';

  return `Tu es ROBOT ANALYTICS, un analyste de données TikTok et expert en viralité, spécialisé dans la croissance d'un compte ${niche.label}.

Ton rôle : faire grandir le compte de façon SCIENTIFIQUE — chaque vidéo doit être meilleure que la précédente. Tu décides par la performance réelle, pas par supposition.

PERFORMANCES DES VIDÉOS RÉCENTES (${niche.label}) :
${table}

Analyse ces performances et déduis ce qui marche vs ce qui floppe pour CE compte.
Réponds à : Pourquoi ces vidéos ont marché ou non ? Quels sujets/hooks/émotions résonnent ? Lesquels éviter ?

Tu contrôles ces leviers à la génération : le SUJET de la vidéo, le HOOK (3 premières secondes), la CAPTION, le CTA (appel à commenter/partager), les HASHTAGS. Concentre tes directives dessus.

Retourne UNIQUEMENT ce JSON (pas de markdown) :
{
  "diagnostic": "2-3 phrases : ce qui marche et ce qui ne marche pas pour ce compte",
  "directives": "Instructions CONCRÈTES et actionnables pour la prochaine vidéo (sujets à privilégier, style de hook, ton, CTA, longueur de caption). 3-5 puces courtes. Interdit de répéter les erreurs passées."
}`;
}

export interface AnalystOutput {
  diagnostic: string;
  directives: string;
}

export function parseAnalystOutput(raw: string): AnalystOutput | null {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const p = JSON.parse(cleaned) as Partial<AnalystOutput>;
    if (!p.directives) return null;
    return { diagnostic: p.diagnostic ?? '', directives: p.directives };
  } catch {
    return null;
  }
}
