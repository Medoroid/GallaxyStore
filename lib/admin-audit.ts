import { logger } from "@/lib/logger";

type AuditEntry = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
};

type AuditClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};

/**
 * Best-effort admin audit write.
 *
 * Audit failures must never roll back the business action that was already
 * committed, so this logs a warning instead of throwing.
 */
export async function recordAdminAudit(db: AuditClient, entry: AuditEntry) {
  try {
    const { error } = await db.from("admin_audit_log").insert({
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
    });

    if (error) {
      logger.warn("[Admin Audit] insert failed:", error);
    }
  } catch (error) {
    logger.warn(
      "[Admin Audit] insert threw:",
      error instanceof Error ? error.message : error
    );
  }
}
