import { cn } from "@/lib/utils";

export const TIER_LABELS: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
  cold: "Cold",
};

export function tierClass(tier: string | null | undefined) {
  switch (tier) {
    case "hot":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "warm":
      return "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300";
    case "cool":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "cold":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function ScoreBadge({
  score,
  tier,
  className,
}: {
  score: number | null | undefined;
  tier: string | null | undefined;
  className?: string;
}) {
  if (score === null || score === undefined) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        tierClass(tier),
        className,
      )}
    >
      {score}
      <span className="font-medium opacity-80">{TIER_LABELS[tier ?? ""] ?? ""}</span>
    </span>
  );
}
