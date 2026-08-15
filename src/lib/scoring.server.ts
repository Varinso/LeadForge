// Lead scoring — server-only. Combines deterministic signals with an AI fit read.
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export type ScoreInput = {
  name: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  about?: string | null;
  ai_summary?: string | null;
  niche: string;
  location: string;
};

export type ScoreResult = {
  score: number;
  tier: "hot" | "warm" | "cool" | "cold";
  reasons: string[];
};

export function tierFor(score: number): ScoreResult["tier"] {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "cool";
  return "cold";
}

/** Deterministic reachability / opportunity signals — 0-45 points. */
export function baseSignals(input: ScoreInput): { points: number; reasons: string[] } {
  let points = 0;
  const reasons: string[] = [];

  if (input.email) {
    points += 14;
    reasons.push("Direct email address found");
  } else {
    reasons.push("No email found — outreach will need a form or call");
  }
  if (input.phone) {
    points += 10;
    reasons.push("Phone number available for a call");
  }
  if (input.website) {
    points += 6;
    reasons.push("Has a live website to audit");
  } else {
    points += 12;
    reasons.push("No website found — large digital-presence gap");
  }
  if (typeof input.review_count === "number") {
    if (input.review_count >= 100) {
      points += 8;
      reasons.push(`${input.review_count} reviews — established demand`);
    } else if (input.review_count >= 20) {
      points += 5;
    } else {
      points += 2;
      reasons.push("Thin review profile — reputation upside");
    }
  }
  if (typeof input.rating === "number" && input.rating >= 4.3) {
    points += 5;
    reasons.push(`Strong ${input.rating}★ rating — good product, weak reach`);
  }
  if (
    input.category &&
    input.niche &&
    input.category.toLowerCase().includes(input.niche.toLowerCase().split(" ")[0] ?? "")
  ) {
    points += 4;
    reasons.push("Category matches your target niche");
  }

  return { points: Math.min(points, 45), reasons };
}

/** Full score: deterministic signals + AI fit judgement (0-55). Falls back gracefully. */
export async function scoreBusiness(input: ScoreInput): Promise<ScoreResult> {
  const base = baseSignals(input);
  let aiPoints = 25;
  let aiReasons: string[] = [];

  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    try {
      const { generateText, Output } = await import("ai");
      const { z } = await import("zod");
      const gateway = createLovableAiGatewayProvider(lovableKey);
      const { output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({
          schema: z.object({
            fit: z.number().min(0).max(55),
            reasons: z.array(z.string()).max(4),
          }),
        }),
        prompt: `You qualify inbound-agency prospects for a ${input.niche} digital marketing / SEO agency working in ${input.location}.

Business: ${input.name}
Website: ${input.website ?? "none found"}
Category: ${input.category ?? "unknown"}
Rating: ${input.rating ?? "n/a"} (${input.review_count ?? "n/a"} reviews)
Context: ${input.ai_summary ?? input.about ?? "n/a"}

Score "fit" from 0 to 55 for how good a paid SEO/marketing client this business would be:
- High: clear revenue, visible marketing gaps (weak/no site, thin content, no local SEO), competitive niche worth investing in.
- Low: too small to pay, already has a strong agency-grade presence, wrong niche, national chain, or a competing agency.
Return 2-4 short reasons (max 14 words each) explaining the score, written for a salesperson.`,
      });
      aiPoints = Math.round(output.fit);
      aiReasons = output.reasons;
    } catch (e) {
      console.error("scoreBusiness AI failed for", input.name, e);
    }
  }

  const score = Math.max(0, Math.min(100, base.points + aiPoints));
  return {
    score,
    tier: tierFor(score),
    reasons: [...aiReasons, ...base.reasons].slice(0, 6),
  };
}
