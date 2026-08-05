"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AlertBanner } from "@/components/ui";
import {
  canDeleteAttachment,
  canUploadAttachments,
  deleteAttachment,
  getAttachmentDownloadUrl,
  listAttachments,
  uploadAttachment,
} from "@/lib/attachments";
import type { Attachment, AttachmentEntityType } from "@/lib/types";

export function AttachmentPanel({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  compact?: boolean;
}) {
  const { user, effectiveRole } = useAuth();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canUpload = canUploadAttachments(effectiveRole, entityType);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAttachments(entityType, entityId);
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUpload = async (fileList: FileList | null) => {
    if (!fileList?.length || !user) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      for (const file of Array.from(fileList)) {
        await uploadAttachment({
          entityType,
          entityId,
          file,
          userId: user.id,
        });
      }
      setMessage("Attachment uploaded.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (attachment: Attachment) => {
    setError(null);
    try {
      const url = await getAttachmentDownloadUrl(attachment.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const onDelete = async (attachment: Attachment) => {
    if (!confirm(`Delete ${attachment.file_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAttachment(attachment);
      setMessage("Attachment deleted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4 opacity-60" />
          Attachments ({items.length})
        </div>
      ) : null}

      {error ? <AlertBanner type="error">{error}</AlertBanner> : null}
      {message ? <AlertBanner type="success">{message}</AlertBanner> : null}

      {canUpload ? (
        <label className={`btn btn-outline btn-sm ${busy ? "btn-disabled" : ""}`}>
          <Paperclip className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload file"}
          <input
            type="file"
            className="hidden"
            multiple
            disabled={busy}
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx"
            onChange={(e) => {
              void onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}

      {loading ? (
        <p className="text-sm opacity-60">Loading attachments…</p>
      ) : items.length === 0 ? (
        <p className="text-sm opacity-60">No files attached yet.</p>
      ) : (
        <ul className="divide-y divide-base-300 border border-base-300 rounded-lg">
          {items.map((item) => {
            const canDelete = canDeleteAttachment(effectiveRole, item, user?.id);
            return (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.file_name}</p>
                  <p className="text-xs opacity-60">
                    {item.size_bytes != null ? `${Math.round(item.size_bytes / 1024)} KB · ` : ""}
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  title="Download"
                  onClick={() => void onDownload(item)}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    title="Delete"
                    disabled={busy}
                    onClick={() => void onDelete(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
