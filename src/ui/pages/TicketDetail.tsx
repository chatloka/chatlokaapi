import { useState, useEffect, useRef, useCallback } from "react";
import { parseDbDate } from "@/lib/dates";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/RichTextEditor";
import { FileDropzone } from "@/components/FileDropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardTableSkeleton } from "@/components/Skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { MergeTicketDialog } from "@/components/MergeTicketDialog";
import { getCategoryLabel, TICKET_CATEGORIES, TICKET_CATEGORY_LABELS } from "@/lib/ticketCategories";
import { ContactTypeBadge, SupportStatusBadge } from "@/components/ContactBadges";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconTicket,
  IconUser,
  IconClock,
  IconSend,
  IconDownload,
  IconEye,
  IconFile,
  IconFileZip,
  IconFileText,
  IconPhoto,
  IconRefresh,
  IconCircleCheck,
  IconLoader,
  IconForbid,
  IconArrowUp,
  IconArrowDown,
  IconCircleDot,
  IconMessageCircle,
  IconMailForward,
  IconInfoCircle,
  IconAt,
  IconLink,
  IconRobot,
  IconGitMerge,
  IconUsers,
  IconKey,
  IconShieldCheck,
  IconPlus,
  IconAlertTriangle,
  IconSparkles,
  IconCpu,
} from "@tabler/icons-react";

interface Ticket {
  id: number;
  ticket_number: string;
  purchase_code: string | null;
  domain: string | null;
  from_email: string;
  from_name?: string | null;
  subject: string;
  status: string;
  priority: string;
  category?: string | null;
  assigned_to: string | null;
  last_message_at: string | null;
  message_count: number;
  first_response_at: string | null;
  first_response_minutes: number | null;
  merged_into?: number | null;
  merged_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface TicketAttachment {
  id: number;
  ticket_message_id: number;
  ticket_id: number;
  filename: string;
  content_type: string;
  file_size: number | null;
  r2_path: string;
  resend_attachment_id: string | null;
  content_id: string | null;
  content_disposition: string | null;
  created_at: string;
}

interface TicketMessage {
  id: number;
  ticket_id: number;
  direction: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  resend_email_id: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  has_attachments: number;
  is_automated?: number;
  created_at: string;
  attachments?: TicketAttachment[];
}

interface TicketContactPurchase {
  id: number;
  purchase_code: string;
  license_type: "regular" | "extended";
  support_until: string | null;
  item_name: string | null;
}interface TicketContact {
  id: number;
  email: string;
  name: string | null;
  type: "lead" | "customer";
  support_status: "active" | "expired" | "none";
  latest_purchase_code: string | null;
  latest_license_type: "regular" | "extended" | null;
  latest_support_until: string | null;
  purchases: TicketContactPurchase[];
}

interface AiAnalysis {
  id: number;
  ticket_id: number;
  status: "pending" | "processing" | "completed" | "failed";
  workflow_instance_id: string | null;
  model: string | null;
  schema_version: number | null;
  summary: string | null;
  category: string | null;
  priority: string | null;
  sentiment: string | null;
  key_points: string[];
  suggested_steps: string[];
  tags: string[];
  confidence: number | null;
  injection_detected: boolean;
  injection_evidence: string | null;
  heuristic_injection: boolean;
  refusal: string | null;
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  created_at: string | null;
  updated_at: string | null;
}

function toWIB(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDbDate(dateStr);
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(contentType: string) {
  if (!contentType) return IconFile;
  const ct = contentType.toLowerCase();
  if (ct.includes("zip") || ct.includes("compressed") || ct.includes("archive"))
    return IconFileZip;
  if (ct.includes("image")) return IconPhoto;
  if (ct.includes("pdf") || ct.includes("text") || ct.includes("document"))
    return IconFileText;
  return IconFile;
}

function getStatusBadge(status: string): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
} {
  switch (status?.toLowerCase()) {
    case "open":
      return {
        variant: "default",
        className:
          "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/20",
        icon: IconCircleDot,
        label: "Open",
      };
    case "pending":
      return {
        variant: "default",
        className:
          "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20",
        icon: IconLoader,
        label: "Pending",
      };
    case "closed":
      return {
        variant: "default",
        className:
          "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/20",
        icon: IconCircleCheck,
        label: "Closed",
      };
    case "merged":
      return {
        variant: "secondary",
        className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
        icon: IconGitMerge,
        label: "Merged",
      };
    default:
      return {
        variant: "secondary",
        className: "bg-muted text-muted-foreground",
        icon: IconInfoCircle,
        label: status || "Unknown",
      };
  }
}

function getPriorityBadge(priority: string): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
} {
  switch (priority?.toLowerCase()) {
    case "high":
      return {
        variant: "destructive",
        className:
          "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20",
        icon: IconArrowUp,
        label: "High",
      };
    case "medium":
      return {
        variant: "default",
        className:
          "bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/20",
        icon: IconArrowUp,
        label: "Medium",
      };
    case "low":
      return {
        variant: "default",
        className:
          "bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/20",
        icon: IconArrowDown,
        label: "Low",
      };
    default:
      return {
        variant: "secondary",
        className: "bg-muted text-muted-foreground",
        icon: IconMinus,
        label: priority || "None",
      };
  }
}

function IconMinus({ size = 16 }: { size?: number }) {
  return <IconCircleDot size={size} />;
}

function formatSender(ticket: Ticket): string {
  return ticket.from_name
    ? `${ticket.from_name} <${ticket.from_email}>`
    : ticket.from_email;
}

// ---------------------------------------------------------------------------
// AI Ticket Analysis card (auto-triage summary rendered from ticket_ai_analyses)
// ---------------------------------------------------------------------------

const AI_SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  frustrated: "Frustrated",
};

const AI_BADGE_COLORS: Record<string, string> = {
  pre_sale: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  installation: "border-pink-500/30 bg-pink-500/10 text-pink-400",
  bug: "border-red-500/30 bg-red-500/10 text-red-400",
  customization: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  feature_request: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  license: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  billing: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  other: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  low: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  high: "border-red-500/30 bg-red-500/10 text-red-400",
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  neutral: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  negative: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  frustrated: "border-red-500/30 bg-red-500/10 text-red-400",
};

function AiAnalysisCard({ analysis }: { analysis: AiAnalysis }) {
  const { status } = analysis;

  if (status === "pending" || status === "processing") {
    return (
      <Card className="border-primary/30">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <IconRobot size={16} className="text-primary" />
              AI Ticket Analysis
            </div>
            <Badge
              variant="outline"
              className="gap-1 border-primary/30 bg-primary/10 text-primary"
            >
              <IconLoader size={11} className="animate-spin" />
              {status === "pending" ? "Queued" : "Analyzing…"}
            </Badge>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "failed") {
    return (
      <Card className="border-red-500/30">
        <CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <IconRobot size={16} className="text-red-400" />
            AI Ticket Analysis
          </div>
          <p className="text-xs text-muted-foreground">
            {analysis.refusal
              ? `Analysis refused by the model: ${analysis.refusal}`
              : analysis.error
                ? `Analysis failed: ${analysis.error}`
                : "Analysis failed."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const showInjectionWarning =
    analysis.injection_detected || analysis.heuristic_injection;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <IconRobot size={16} className="text-primary" />
            AI Ticket Analysis
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            >
              <IconSparkles size={11} />
              Completed
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {analysis.model && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {analysis.model}
              </span>
            )}
            {analysis.confidence !== null && analysis.confidence !== undefined && (
              <span title={`Confidence ${Math.round(analysis.confidence * 100)}%`}>
                Confidence {Math.round(analysis.confidence * 100)}%
              </span>
            )}
          </div>
        </div>

        {showInjectionWarning && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <b>Possible prompt injection detected</b> — the email contains text
              that looks like instructions aimed at an AI. The analysis below may
              be unreliable; verify manually.
              {analysis.injection_evidence && (
                <div className="mt-0.5 font-mono text-[10px] opacity-80">
                  {analysis.injection_evidence}
                </div>
              )}
            </div>
          </div>
        )}

        {analysis.summary && (
          <p className="mb-3 text-sm leading-relaxed text-foreground/90">
            {analysis.summary}
          </p>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {analysis.category && (
            <Badge className={`border font-normal ${AI_BADGE_COLORS[analysis.category] || AI_BADGE_COLORS.other}`}>
              {TICKET_CATEGORY_LABELS[analysis.category] || analysis.category}
            </Badge>
          )}
          {analysis.priority && (
            <Badge className={`border font-normal ${AI_BADGE_COLORS[analysis.priority] || ""}`}>
              Priority: {analysis.priority.toUpperCase()}
            </Badge>
          )}
          {analysis.sentiment && (
            <Badge className={`border font-normal ${AI_BADGE_COLORS[analysis.sentiment] || ""}`}>
              {AI_SENTIMENT_LABELS[analysis.sentiment] || analysis.sentiment}
            </Badge>
          )}
        </div>

        {analysis.key_points.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              Key points
            </div>
            <ul className="space-y-1 text-sm text-foreground/90">
              {analysis.key_points.map((point, i) => (
                <li key={i} className="flex items-start gap-2">
                  <IconCircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.suggested_steps.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              Suggested next steps
            </div>
            <ul className="space-y-1 text-sm text-foreground/90">
              {analysis.suggested_steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <IconCpu size={14} className="mt-0.5 shrink-0 text-primary" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {analysis.tags.map((tag, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {(analysis.input_tokens !== null ||
          analysis.output_tokens !== null ||
          analysis.cost_usd !== null) && (
          <div className="mt-2 flex flex-wrap gap-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
            {analysis.input_tokens !== null && (
              <span>{analysis.input_tokens.toLocaleString()} in</span>
            )}
            {analysis.output_tokens !== null && (
              <span>{analysis.output_tokens.toLocaleString()} out</span>
            )}
            {analysis.latency_ms !== null && (
              <span>{(analysis.latency_ms / 1000).toFixed(1)}s</span>
            )}
            {analysis.cost_usd !== null && (
              <span>${analysis.cost_usd.toFixed(4)}</span>
            )}
            {analysis.schema_version !== null && (
              <span>schema v{analysis.schema_version}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [mergedIntoTicket, setMergedIntoTicket] = useState<Ticket | null>(null);
  const [mergedSources, setMergedSources] = useState<Ticket[]>([]);
  const [contact, setContact] = useState<TicketContact | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertVerifying, setConvertVerifying] = useState(false);
  const [convertCode, setConvertCode] = useState("");
  const [convertLicense, setConvertLicense] = useState<"regular" | "extended">("regular");
  const [convertItem, setConvertItem] = useState("");
  const [convertPurchaseDate, setConvertPurchaseDate] = useState("");
  const [convertSupportUntil, setConvertSupportUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replySending, setReplySending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [aiNullPollStopped, setAiNullPollStopped] = useState(false);

  const isReplyDirty =
    replyOpen &&
    (replyBody.replace(/<[^>]*>/g, "").trim().length > 0 ||
      replyFiles.length > 0);
  const blocker = useBlocker(isReplyDirty);
  const hasExitBlocker = blocker.state === "blocked";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchTicket = useCallback(async () => {
    if (!ticketNumber) return;
    try {
      setLoading(true);
      const res = await fetch(`/manage/api/tickets/${ticketNumber}`);
      if (!res.ok) throw new Error("Failed to fetch ticket");
      const data = (await res.json()) as {
        ticket: Ticket;
        messages: TicketMessage[];
        participants?: string[];
        merged_into_ticket?: Ticket | null;
        merged_sources?: Ticket[];
        contact?: TicketContact | null;
      };
      setTicket(data.ticket);
      setMessages(data.messages || []);
      setParticipants(data.participants || []);
      setMergedIntoTicket(data.merged_into_ticket || null);
      setMergedSources(data.merged_sources || []);
      setContact(data.contact || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketNumber]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchAiAnalysis = useCallback(async () => {
    if (!ticketNumber) return;
    try {
      const res = await fetch(
        `/manage/api/tickets/${ticketNumber}/ai-analysis`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { analysis?: AiAnalysis | null };
      setAiAnalysis(data.analysis || null);
    } catch {
      // silent — keep last state while polling
    }
  }, [ticketNumber]);

  useEffect(() => {
    fetchAiAnalysis();
  }, [fetchAiAnalysis, aiAnalysis?.status]);

  // Poll while a row exists but isn't finished. If the first fetch found
  // nothing (analysis row not inserted yet), keep polling briefly so a
  // freshly created ticket still shows the card once the workflow starts.
  useEffect(() => {
    const isActive =
      aiAnalysis === null ? !aiNullPollStopped : aiAnalysis.status === "pending" || aiAnalysis.status === "processing";
    if (!isActive) return;
    const interval = setInterval(fetchAiAnalysis, 5000);
    return () => clearInterval(interval);
  }, [fetchAiAnalysis, aiAnalysis, aiNullPollStopped]);

  // Stop polling for tickets that will never have an analysis row
  // (old tickets, or webhooks that failed before creating one).
  useEffect(() => {
    if (aiAnalysis !== null) return;
    const timeout = setTimeout(() => setAiNullPollStopped(true), 180000);
    return () => clearTimeout(timeout);
  }, [fetchAiAnalysis, aiAnalysis]);

  const handleStatusChange = async (newStatus: string) => {
    if (!ticketNumber) return;
    try {
      setUpdatingStatus(true);
      const res = await fetch(`/manage/api/tickets/${ticketNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      const data = (await res.json()) as { ticket?: Ticket };
      setTicket(data.ticket || ({ ...ticket, status: newStatus } as Ticket));
      toast.success("Status updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!ticketNumber) return;
    try {
      setUpdatingPriority(true);
      const res = await fetch(`/manage/api/tickets/${ticketNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) throw new Error("Failed to update priority");
      const data = (await res.json()) as { ticket?: Ticket };
      setTicket(data.ticket || ({ ...ticket, priority: newPriority } as Ticket));
      toast.success("Priority updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update priority",
      );
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleCategoryChange = async (newCategory: string) => {
    if (!ticketNumber) return;
    try {
      setUpdatingCategory(true);
      const res = await fetch(`/manage/api/tickets/${ticketNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory }),
      });
      if (!res.ok) throw new Error("Failed to update category");
      const data = (await res.json()) as { ticket?: Ticket };
      setTicket(data.ticket || ({ ...ticket, category: newCategory } as Ticket));
      toast.success("Category updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update category",
      );
    } finally {
      setUpdatingCategory(false);
    }
  };

  const handleMerged = () => {
    fetchTicket();
  };

  const toDateInput = (iso: string | null | undefined): string =>
    iso ? iso.slice(0, 10) : "";

  const handleConvertVerify = async () => {
    if (!convertCode.trim()) return;
    setConvertVerifying(true);
    try {
      const res = await fetch("/manage/api/contacts/verify-purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_code: convertCode.trim() }),
      });
      const data = (await res.json()) as { purchase?: { license_type: "regular" | "extended"; item_name: string | null; purchase_date: string | null; support_until: string | null }; error?: string };
      if (!res.ok) {
        toast.error(data.error || "Verifikasi gagal");
        return;
      }
      if (data.purchase) {
        setConvertLicense(data.purchase.license_type);
        setConvertItem(data.purchase.item_name || "");
        setConvertPurchaseDate(toDateInput(data.purchase.purchase_date));
        setConvertSupportUntil(toDateInput(data.purchase.support_until));
        toast.success("Purchase code valid — data terisi otomatis dari Envato");
      }
    } catch {
      toast.error("Terjadi kesalahan saat verifikasi");
    } finally {
      setConvertVerifying(false);
    }
  };

  const handleConvertToCustomer = async () => {
    if (!contact) return;
    if (!convertCode.trim()) {
      toast.error("Purchase code wajib diisi");
      return;
    }
    setConvertSaving(true);
    try {
      const res = await fetch(`/manage/api/contacts/${contact.id}/purchases`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_code: convertCode.trim(),
          license_type: convertLicense,
          item_name: convertItem || null,
          purchase_date: convertPurchaseDate ? new Date(`${convertPurchaseDate}T00:00:00`).toISOString() : null,
          support_until: convertSupportUntil ? new Date(`${convertSupportUntil}T00:00:00`).toISOString() : null,
          support_term_months: 6,
          source: "manual",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Gagal mengonversi");
      toast.success("Kontak dikonversi menjadi Customer");
      setConvertOpen(false);
      setConvertCode("");
      setConvertItem("");
      setConvertPurchaseDate("");
      setConvertSupportUntil("");
      await fetchTicket();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengonversi");
    } finally {
      setConvertSaving(false);
    }
  };

  const handleSendReply = async () => {
    if (!ticketNumber) return;
    const bodyText = replyBody.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!bodyText && replyFiles.length === 0) {
      toast.error("Write a message or attach a file");
      return;
    }
    try {
      setReplySending(true);
      const form = new FormData();
      form.append("body_html", replyBody.trim() || "");
      form.append("body_text", bodyText);
      for (const file of replyFiles) {
        form.append("files", file);
      }
      const res = await fetch(`/manage/api/tickets/${ticketNumber}/reply`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(errData?.error?.message || "Failed to send reply");
      }
      setReplyFiles([]);
      setReplyBody("");
      setReplyOpen(false);
      toast.success("Reply sent");
      fetchTicket();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send reply",
      );
    } finally {
      setReplySending(false);
    }
  };

  const handleDownloadAttachment = async (attachment: TicketAttachment) => {
    try {
      const res = await fetch(
        `/manage/api/tickets/attachments/${attachment.id}`,
      );
      if (!res.ok) throw new Error("Failed to download attachment");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = attachment.filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download attachment",
      );
    }
  };

  const handlePreviewAttachment = async (attachment: TicketAttachment) => {
    try {
      const res = await fetch(
        `/manage/api/tickets/attachments/${attachment.id}`,
      );
      if (!res.ok) throw new Error("Failed to load attachment");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewImage(url);
      setPreviewFilename(attachment.filename);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load preview",
      );
    }
  };

  const isImageContent = (contentType: string): boolean => {
    return contentType?.toLowerCase().startsWith("image/") || false;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/manage/tickets")}
            className="cursor-pointer"
          >
            <IconArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </div>
        <CardTableSkeleton rows={8} />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/manage/tickets")}
            className="cursor-pointer"
          >
            <IconArrowLeft size={16} className="mr-1" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <IconForbid size={48} className="mb-4 text-muted-foreground" />
            <p className="text-lg font-medium text-foreground">
              {error || "Ticket not found"}
            </p>
            <Button
              variant="outline"
              className="mt-4 cursor-pointer"
              onClick={() => navigate("/manage/tickets")}
            >
              Back to Tickets
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusBadge = getStatusBadge(ticket.status);
  const priorityBadge = getPriorityBadge(ticket.priority);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/manage/tickets")}
            className="cursor-pointer"
          >
            <IconArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-2">
            <IconTicket size={20} className="text-muted-foreground" />
            <span className="font-mono text-sm text-muted-foreground">
              {ticket.ticket_number}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ticket.status !== "merged" && (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => setMergeOpen(true)}
            >
              <IconGitMerge size={14} className="mr-1" />
              Merge
            </Button>
          )}
          {ticket.status !== "closed" && ticket.status !== "merged" && (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
              onClick={() => handleStatusChange("closed")}
              disabled={updatingStatus}
            >
              {updatingStatus ? (
                <IconLoader size={14} className="mr-1 animate-spin" />
              ) : (
                <IconCircleCheck size={14} className="mr-1" />
              )}
              Mark as Resolved
            </Button>
          )}
          <Badge
            variant={statusBadge.variant}
            className={`${statusBadge.className} gap-1 text-xs`}
          >
            <statusBadge.icon size={12} />
            {statusBadge.label}
          </Badge>
          <Badge
            variant={priorityBadge.variant}
            className={`${priorityBadge.className} gap-1 text-xs`}
          >
            <priorityBadge.icon size={12} />
            {priorityBadge.label}
          </Badge>
        </div>
      </div>

      {/* Merged-into banner */}
      {ticket.status === "merged" && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="flex items-center gap-3 p-3 text-sm">
            <IconGitMerge size={18} className="shrink-0 text-purple-400" />
            <span className="text-foreground">
              This ticket has been merged into{" "}
              <button
                type="button"
                className="cursor-pointer font-mono text-blue-400 underline-offset-2 hover:underline"
                onClick={() => navigate(`/manage/tickets/${mergedIntoTicket?.ticket_number}`)}
              >
                {mergedIntoTicket?.ticket_number || "another ticket"}
              </button>
              . Replies to this ticket are no longer processed here.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Merged-into banner */}
      {mergedSources.length > 0 && ticket.status !== "merged" && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="flex items-center gap-3 p-3 text-sm">
            <IconGitMerge size={18} className="shrink-0 text-purple-400" />
            <span className="text-foreground">
              {mergedSources.length} ticket{mergedSources.length !== 1 ? "s" : ""} merged
              into this one:{" "}
              <span className="font-mono text-purple-400">
                {mergedSources.map((s) => s.ticket_number).join(", ")}
              </span>
            </span>
          </CardContent>
        </Card>
      )}

      {/* Subject & metadata */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">
              {ticket.subject}
            </h1>
            <Badge className={`border font-normal ${AI_BADGE_COLORS[ticket.category || "other"] || AI_BADGE_COLORS.other}`}>
              {getCategoryLabel(ticket.category)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <IconUser size={14} />
              <span>{formatSender(ticket)}</span>
              {contact && (
                <div className="flex items-center gap-1.5">
                  <ContactTypeBadge type={contact.type} />
                  {contact.type === "customer" && (
                    <SupportStatusBadge
                      status={contact.support_status}
                      supportUntil={contact.latest_support_until}
                    />
                  )}
                </div>
              )}
              {contact?.purchases.length === 1 && (
                <Badge className="gap-1 font-normal" variant="outline">
                  <IconKey size={10} />
                  {contact.purchases[0].purchase_code}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <IconClock size={14} />
              <span>{toWIB(ticket.created_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <IconMessageCircle size={14} />
              <span>
                {ticket.message_count} message
                {ticket.message_count !== 1 ? "s" : ""}
              </span>
            </div>
            {ticket.domain && (
              <div className="flex items-center gap-1.5">
                <IconLink size={14} />
                <span>{ticket.domain}</span>
              </div>
            )}
            {ticket.purchase_code && (
              <div className="flex items-center gap-1.5">
                <IconAt size={14} />
                <span className="font-mono text-xs">
                  {ticket.purchase_code}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Ticket Analysis (auto-triage: summary, category, priority, sentiment) */}
      {aiAnalysis && (
        <AiAnalysisCard analysis={aiAnalysis} />
      )}

      {/* Main content: messages + sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Messages column */}
        <div className="min-w-0 space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            Messages ({messages.length})
          </h2>
          <div
            ref={messagesContainerRef}
            className="flex max-h-[500px] flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card/50 p-3 sm:p-4"
          >
            {messages.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No messages yet
              </div>
            )}
            {messages.map((msg) => {
              const isOutbound =
                msg.direction === "outbound" || msg.direction === "outgoing";
              const isAutomated = msg.is_automated === 1;
              const borderClass = isAutomated
                ? "border-purple-500/25 bg-purple-500/5"
                : isOutbound
                  ? "ml-0 border-blue-500/20 bg-blue-500/5 sm:ml-8"
                  : "mr-0 border-border bg-card sm:mr-8";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-1.5 rounded-lg border p-3 ${borderClass}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          isAutomated
                            ? "bg-purple-500/15 text-purple-400"
                            : isOutbound
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isAutomated ? (
                          <IconRobot size={12} />
                        ) : isOutbound ? (
                          <IconMailForward size={12} />
                        ) : (
                          <IconUser size={12} />
                        )}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {isAutomated ? "Chatloka Support (Automated)" : isOutbound ? "Admin" : msg.from_email}
                      </span>
                      {isAutomated && (
                        <span className="rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-400">
                          Auto-reply
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {toWIB(msg.created_at)}
                    </span>
                  </div>
                  {msg.body_html ? (
                    <div
                      className={`prose prose-invert prose-sm max-w-none text-sm text-foreground/90 ${
                        isAutomated ? "msg-auto-body" : ""
                      }`}
                      dangerouslySetInnerHTML={{ __html: msg.body_html }}
                    />
                  ) : (
                    <p className="text-sm text-foreground/80">
                      {msg.body_text || "(No content)"}
                    </p>
                  )}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                      {msg.attachments.map((att) => {
                        const FileIcon = getFileIcon(att.content_type);
                        const isImage = isImageContent(att.content_type);
                        return (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs"
                          >
                            <FileIcon
                              size={14}
                              className="shrink-0 text-muted-foreground"
                            />
                            <span className="max-w-[140px] truncate text-foreground sm:max-w-[180px]">
                                {att.filename}
                              </span>
                            <span className="text-muted-foreground">
                              {formatFileSize(att.file_size)}
                            </span>
                            <div className="flex items-center gap-1">
                              {isImage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 cursor-pointer p-0"
                                  onClick={() => handlePreviewAttachment(att)}
                                >
                                  <IconEye size={12} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 cursor-pointer p-0"
                                onClick={() => handleDownloadAttachment(att)}
                              >
                                <IconDownload size={12} />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply section */}
          {!replyOpen && ticket.status !== "closed" && ticket.status !== "merged" && (
            <Button
              variant="outline"
              className="w-full cursor-pointer"
              onClick={() => setReplyOpen(true)}
            >
              <IconMailForward size={16} className="mr-2" />
              Reply
            </Button>
          )}
          {replyOpen && (
            <Card className="border-blue-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <IconMailForward size={16} />
                    Reply to {formatSender(ticket)}
                    {participants.length > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">
                        (CC: {participants.length} participant
                        {participants.length !== 1 ? "s" : ""})
                      </span>
                    )}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setReplyOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <RichTextEditor
                  value={replyBody}
                  onChange={setReplyBody}
                  placeholder="Type your reply..."
                />
                <FileDropzone
                  files={replyFiles}
                  onChange={setReplyFiles}
                  maxSizeMB={10}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      setReplyOpen(false);
                      setReplyFiles([]);
                    }}
                    disabled={replySending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    onClick={handleSendReply}
                    disabled={
                      (!replyBody.replace(/<[^>]*>/g, "").trim() && replyFiles.length === 0) ||
                      replySending
                    }
                  >
                    {replySending ? (
                      <IconLoader size={14} className="mr-1 animate-spin" />
                    ) : (
                      <IconSend size={14} className="mr-1" />
                    )}
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar info */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Details</h2>
          <Card>
            <CardContent className="space-y-4 p-4">
              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Status
                </label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => v && handleStatusChange(v)}
                  disabled={updatingStatus}
                >
                  <SelectTrigger className="h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open" className="cursor-pointer">
                      Open
                    </SelectItem>
                    <SelectItem value="pending" className="cursor-pointer">
                      Pending
                    </SelectItem>
                    <SelectItem value="closed" className="cursor-pointer">
                      Closed
                    </SelectItem>
                  </SelectContent>
                </Select>
                {updatingStatus && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconLoader size={10} className="animate-spin" />
                    Updating...
                  </div>
                )}
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Priority
                </label>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => v && handlePriorityChange(v)}
                  disabled={updatingPriority}
                >
                  <SelectTrigger className="h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="cursor-pointer">
                      Low
                    </SelectItem>
                    <SelectItem value="medium" className="cursor-pointer">
                      Medium
                    </SelectItem>
                    <SelectItem value="high" className="cursor-pointer">
                      High
                    </SelectItem>
                  </SelectContent>
                </Select>
                {updatingPriority && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconLoader size={10} className="animate-spin" />
                    Updating...
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Category
                </label>
                <Select
                  value={ticket.category || "other"}
                  onValueChange={(v) => v && handleCategoryChange(v)}
                  disabled={updatingCategory}
                >
                  <SelectTrigger className="h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="cursor-pointer">
                        {getCategoryLabel(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {updatingCategory && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconLoader size={10} className="animate-spin" />
                    Updating...
                  </div>
                )}
                <p className="text-[10px] leading-snug text-muted-foreground/70">
                  Auto-set by AI triage on new tickets; override manually here.
                </p>
              </div>

              <div className="border-t border-border" />

              {/* Info rows */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">From</span>
                  <span className="text-foreground">{formatSender(ticket)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <IconUsers size={12} />
                    Participants
                  </span>
                  <span className="text-foreground">
                    {participants.length > 0 ? participants.join(", ") : "—"}
                  </span>
                </div>

                {/* Contact / customer status block */}
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <IconKey size={12} />
                    Badge
                  </span>
                  <div className="flex flex-col items-end gap-1">
                    <ContactTypeBadge type={contact?.type} />
                    {contact?.type === "customer" && (
                      <SupportStatusBadge
                        status={contact.support_status}
                        supportUntil={contact.latest_support_until}
                      />
                    )}
                  </div>
                </div>
                {contact?.latest_license_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lisensi</span>
                    <span className="text-foreground">
                      {contact.latest_license_type === "regular" ? "Regular" : "Extended"}
                    </span>
                  </div>
                )}
                {contact?.latest_support_until && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Support s/d</span>
                    <span className="text-foreground">
                      {toWIB(contact.latest_support_until)}
                    </span>
                  </div>
                )}

                {contact?.type === "lead" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full cursor-pointer text-xs"
                    onClick={() => setConvertOpen(true)}
                  >
                    <IconPlus size={14} className="mr-1" />
                    Convert to Customer
                  </Button>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">
                    {toWIB(ticket.created_at)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="text-foreground">
                    {toWIB(ticket.updated_at)}
                  </span>
                </div>
                {ticket.last_message_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last reply</span>
                    <span className="text-foreground">
                      {toWIB(ticket.last_message_at)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Messages</span>
                  <span className="text-foreground">
                    {ticket.message_count}
                  </span>
                </div>
                {ticket.domain && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Domain</span>
                    <span className="truncate text-foreground" title={ticket.domain}>
                      {ticket.domain}
                    </span>
                  </div>
                )}
                {ticket.purchase_code && (
                  <div className="flex justify-between gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      Purchase
                    </span>
                    <span className="truncate font-mono text-foreground" title={ticket.purchase_code}>
                      {ticket.purchase_code}
                    </span>
                  </div>
                )}
                {ticket.assigned_to && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned</span>
                    <span className="text-foreground">
                      {ticket.assigned_to}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-border" />

              {/* Refresh */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer text-xs"
                onClick={fetchTicket}
              >
                <IconRefresh size={14} className="mr-1" />
                Refresh
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Convert to Customer dialog */}
      <Dialog
        open={convertOpen}
        onOpenChange={(open) => {
          setConvertOpen(open);
          if (!open) {
            setConvertCode("");
            setConvertItem("");
            setConvertPurchaseDate("");
            setConvertSupportUntil("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <IconKey size={16} />
              Convert to Customer
            </DialogTitle>
            <DialogDescription>
              Tambahkan purchase code dari email user (copy-paste manual) untuk
              menandai kontak ini sebagai Customer dan menghitung masa support.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {contact?.email && (
              <p className="text-xs text-muted-foreground">
                Pengirim: <span className="font-mono">{contact.email}</span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Purchase Code *</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 font-mono text-xs"
                  placeholder="mis. 12345678-aaaa-bbbb-cccc-dddd1234abcd"
                  value={convertCode}
                  onChange={(e) => setConvertCode(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer shrink-0"
                  onClick={handleConvertVerify}
                  disabled={convertVerifying || !convertCode.trim()}
                >
                  {convertVerifying ? (
                    <IconLoader size={14} className="mr-1 animate-spin" />
                  ) : (
                    <IconShieldCheck size={14} className="mr-1" />
                  )}
                  {convertVerifying ? "..." : "Verify"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipe Lisensi</Label>
              <Select
                value={convertLicense}
                onValueChange={(v) =>
                  (v === "regular" || v === "extended") && setConvertLicense(v)
                }
              >
                <SelectTrigger className="h-8 cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular" className="cursor-pointer">
                    Regular
                  </SelectItem>
                  <SelectItem value="extended" className="cursor-pointer">
                    Extended
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Item</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Nama produk (opsional)"
                value={convertItem}
                onChange={(e) => setConvertItem(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tanggal Pembelian</Label>
                <Input
                  className="h-8 text-xs"
                  type="date"
                  value={convertPurchaseDate}
                  onChange={(e) => setConvertPurchaseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Support Sampai</Label>
                <Input
                  className="h-8 text-xs"
                  type="date"
                  value={convertSupportUntil}
                  onChange={(e) => setConvertSupportUntil(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => setConvertOpen(false)}
              disabled={convertSaving}
            >
              Batal
            </Button>
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={handleConvertToCustomer}
              disabled={convertSaving}
            >
              {convertSaving ? (
                <IconLoader size={14} className="mr-1 animate-spin" />
              ) : (
                <IconKey size={14} className="mr-1" />
              )}
              Konversi ke Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image preview dialog */}
      <Dialog
        open={!!previewImage}
        onOpenChange={(open) => {
          if (!open) {
            if (previewImage) URL.revokeObjectURL(previewImage);
            setPreviewImage(null);
            setPreviewFilename("");
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{previewFilename}</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <img
              src={previewImage}
              alt={previewFilename}
              className="max-h-[70vh] w-full object-contain rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Unsent reply guard */}
      <Dialog
        open={hasExitBlocker}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Discard unsent reply?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have an unsent reply. If you leave this page, your message and
            any attached files will be lost.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => blocker.reset?.()}
            >
              Stay
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                setReplyFiles([]);
                setReplyBody("");
                setReplyOpen(false);
                blocker.proceed?.();
              }}
            >
              Discard reply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge tickets dialog */}
      {ticket.status !== "merged" && ticketNumber && (
        <MergeTicketDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          currentTicketNumber={ticketNumber}
          onMerged={handleMerged}
        />
      )}
    </div>
  );
}
