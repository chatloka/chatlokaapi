import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  IconSearch,
  IconGitMerge,
  IconTicket,
  IconX,
  IconPlus,
  IconArrowsExchange,
  IconCheck,
  IconLoader,
} from "@tabler/icons-react";

interface Ticket {
  id: number;
  ticket_number: string;
  from_email: string;
  subject: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTicketNumber: string;
  onMerged: (targetTicketNumber: string) => void;
}

export function MergeTicketDialog({
  open,
  onOpenChange,
  currentTicketNumber,
  onMerged,
}: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"this" | "new">("this");
  const [newSubject, setNewSubject] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Ticket[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Ticket[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset when the dialog opens
  useEffect(() => {
    if (open) {
      setMode("this");
      setNewSubject("");
      setSearch("");
      setResults([]);
      setSelected([]);
      setSubmitting(false);
    }
  }, [open]);

  // Debounced search for source tickets
  useEffect(() => {
    if (!open) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (abortRef.current) abortRef.current.abort();
    if (!search.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/manage/api/tickets?search=${encodeURIComponent(search.trim())}&limit=10&sort=newest`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as { tickets: Ticket[] };
        setResults(
          (data.tickets || []).filter(
            (t) => t.ticket_number !== currentTicketNumber
          )
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const toggleSource = (t: Ticket) => {
    setSelected((prev) =>
      prev.some((s) => s.id === t.id)
        ? prev.filter((s) => s.id !== t.id)
        : [...prev, t]
    );
  };

  const handleConfirm = async () => {
    if (selected.length === 0) {
      toast.error("Select at least one ticket to merge");
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch("/manage/api/tickets/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_ticket_number: mode === "this" ? currentTicketNumber : undefined,
          source_ticket_numbers: selected.map((t) => t.ticket_number),
          new_ticket_subject: mode === "new" ? newSubject.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; target_ticket_number?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error?.message || "Merge failed");
      }
      toast.success(
        mode === "new"
          ? `Created ${data?.target_ticket_number} and merged ${selected.length} ticket${selected.length !== 1 ? "s" : ""}`
          : "Tickets merged successfully"
      );
      onOpenChange(false);
      const target = data?.target_ticket_number || currentTicketNumber;
      onMerged(target);
      if (mode === "new" && target !== currentTicketNumber) {
        navigate(`/manage/tickets/${target}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setSubmitting(false);
    }
  };

  const modeBtn = (value: "this" | "new", label: string, sub: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-left transition-colors ${
        mode === value
          ? "border-blue-500/50 bg-blue-500/10"
          : "border-border bg-card hover:bg-muted/50"
      }`}
    >
      <span className={`mt-0.5 ${mode === value ? "text-blue-400" : "text-muted-foreground"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <IconGitMerge size={16} />
            Merge tickets
          </DialogTitle>
          <DialogDescription>
            Combine duplicate or related tickets into one. All messages,
            attachments, and participants are moved to the target; replies to
            the merged ticket are CC&apos;d to every participant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Merge into
            </label>
            <div className="grid grid-cols-2 gap-2">
              {modeBtn("this", `This ticket`, currentTicketNumber, <IconTicket size={14} />)}
              {modeBtn("new", "A new ticket", "Creates a fresh ticket to hold the merged conversation", <IconPlus size={14} />)}
            </div>
            {mode === "new" && (
              <Input
                className="mt-2 h-8 text-xs"
                placeholder="New ticket subject (optional — defaults to first selected)"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
            )}
          </div>

          {/* Search */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Find tickets to merge
            </label>
            <div className="relative">
              <IconSearch
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Search by ticket number, email, or subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Results */}
            {search.trim() && (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
                {searching && (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                    <Skeleton className="h-3.5 w-3.5 rounded-full" /> Searching...
                  </div>
                )}
                {!searching && results.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No tickets found
                  </div>
                )}
                {!searching &&
                  results.map((t) => {
                    const isSelected = selected.some((s) => s.id === t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleSource(t)}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-blue-500/15 text-foreground"
                            : "hover:bg-muted/60 text-foreground"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-border"
                          }`}
                        >
                          {isSelected && <IconCheck size={10} />}
                        </span>
                        <span className="shrink-0 font-mono text-muted-foreground">
                          {t.ticket_number}
                        </span>
                        <span className="truncate">{t.subject}</span>
</button>
                  );
                })}
              </div>
            )}

            {/* Selected sources */}
            {selected.length > 0 && (
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {selected.length} ticket{selected.length !== 1 ? "s" : ""} to merge
                  {mode === "new" ? " into a new ticket" : ""}
                </label>
                <div className="space-y-1">
                  {selected.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
                    >
                      <IconGitMerge size={12} className="shrink-0 text-muted-foreground" />
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {t.ticket_number}
                      </span>
                      <span className="truncate text-foreground">{t.subject}</span>
                      <span className="ml-auto shrink-0 truncate text-muted-foreground">
                        {t.from_email}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 shrink-0 cursor-pointer p-0"
                        onClick={() => toggleSource(t)}
                      >
                        <IconX size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="cursor-pointer"
            onClick={handleConfirm}
            disabled={selected.length === 0 || submitting}
          >
            {submitting ? (
              <IconLoader size={14} className="mr-1 animate-spin" />
            ) : (
              <IconArrowsExchange size={14} className="mr-1" />
            )}
            Merge {selected.length > 0 ? selected.length : ""} ticket
            {selected.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}