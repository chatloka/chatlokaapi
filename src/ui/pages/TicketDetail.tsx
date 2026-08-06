import { useState, useEffect, useRef, useCallback } from "react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardTableSkeleton } from "@/components/Skeletons";
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
} from "@tabler/icons-react";

interface Ticket {
  id: number;
  ticket_number: string;
  purchase_code: string | null;
  domain: string | null;
  from_email: string;
  subject: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  last_message_at: string | null;
  message_count: number;
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

function toWIB(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
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

export function TicketDetail() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replySending, setReplySending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState("");

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
      };
      setTicket(data.ticket);
      setMessages(data.messages || []);
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

      {/* Subject & metadata */}
      <Card>
        <CardContent className="p-4">
          <h1 className="mb-3 text-xl font-semibold text-foreground">
            {ticket.subject}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <IconUser size={14} />
              <span>{ticket.from_email}</span>
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
                      className="prose prose-invert prose-sm max-w-none text-sm text-foreground/90"
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
          {!replyOpen && ticket.status !== "closed" && (
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
                    Reply to {ticket.from_email}
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

              <div className="border-t border-border" />

              {/* Info rows */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">From</span>
                  <span className="text-foreground">{ticket.from_email}</span>
                </div>
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
    </div>
  );
}
