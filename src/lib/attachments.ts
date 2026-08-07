import { createClient } from "@/lib/supabase/client";
import type { Attachment, AttachmentEntityType } from "@/lib/types";

export const ATTACHMENTS_BUCKET = "attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
}

export function validateAttachmentFile(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "File must be 10MB or smaller.";
  }
  if (file.type && !ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return "Unsupported file type. Use PDF, images, or Office documents.";
  }
  return null;
}

export async function listAttachments(
  entityType: AttachmentEntityType,
  entityId: string
): Promise<Attachment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Attachment[]) ?? [];
}

export async function uploadAttachment(params: {
  entityType: AttachmentEntityType;
  entityId: string;
  file: File;
  userId: string;
}): Promise<Attachment> {
  const validationError = validateAttachmentFile(params.file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const safeName = sanitizeFileName(params.file.name);
  const storagePath = `${params.entityType}/${params.entityId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, params.file, {
      contentType: params.file.type || undefined,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      file_name: params.file.name,
      storage_path: storagePath,
      mime_type: params.file.type || null,
      size_bytes: params.file.size,
      uploaded_by: params.userId,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
    throw error;
  }

  return data as Attachment;
}

export async function getAttachmentDownloadUrl(storagePath: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not create download link.");
  return data.signedUrl;
}

export async function deleteAttachment(attachment: Attachment): Promise<void> {
  const supabase = createClient();
  const { error: dbError } = await supabase.from("attachments").delete().eq("id", attachment.id);
  if (dbError) throw dbError;
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
}

export function canUploadAttachments(
  role: string,
  entityType: AttachmentEntityType
): boolean {
  if (entityType === "invoice") {
    return role !== "subcontractor" && role !== "field_supervisor" && role !== "client";
  }
  if (entityType === "change_order") {
    return role === "admin" || role === "owner" || role === "project_manager";
  }
  return role !== "client";
}

export function canDeleteAttachment(
  role: string,
  attachment: Attachment,
  userId: string | undefined
): boolean {
  if (role === "client") return false;
  if (role === "admin" || role === "owner" || role === "project_manager") return true;
  return Boolean(userId && attachment.uploaded_by === userId);
}
