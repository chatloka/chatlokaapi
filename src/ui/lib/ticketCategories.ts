export const TICKET_CATEGORIES = [
  "pre_sale",
  "installation",
  "bug",
  "customization",
  "feature_request",
  "license",
  "billing",
  "other",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  pre_sale: "Pre-Sale Question",
  installation: "Installation",
  bug: "Bug Report",
  customization: "Customization Request",
  feature_request: "Feature Request",
  license: "License / Activation",
  billing: "Billing / Refund",
  other: "Other",
};

export const TICKET_CATEGORY_COLORS: Record<string, string> = {
  pre_sale: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  installation: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  bug: "bg-red-500/15 text-red-400 border-red-500/20",
  customization: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  feature_request: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  license: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  billing: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  other: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

export function getCategoryBadgeClass(category: string | null | undefined) {
  if (!category) return TICKET_CATEGORY_COLORS.other;
  return TICKET_CATEGORY_COLORS[category] || TICKET_CATEGORY_COLORS.other;
}

export function getCategoryLabel(category: string | null | undefined) {
  if (!category) return "Other";
  return TICKET_CATEGORY_LABELS[category] || category;
}
