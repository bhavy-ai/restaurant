'use client';
import { createClient } from '@/lib/supabase/client';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  extra?: Record<string, unknown>;
}

export async function trackError(error: Error | unknown, context: ErrorContext = {}): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));

  // Always log to console
  console.error('[ErrorTracking]', err.message, context);

  try {
    const supabase = createClient();
    const changesPayload = {
      error_message: err.message,
      error_stack: err.stack?.slice(0, 2000) || null,
      component: context.component || null,
      action: context.action || null,
      extra: context.extra || null,
      url: typeof window !== 'undefined' ? window.location.pathname : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      timestamp: new Date().toISOString(),
    };

    let payload: Record<string, unknown> = {
      // Base audit_logs schema compatibility
      staff_name: context.userId || 'system',
      staff_role: 'system',
      action: context.action || 'client_error',
      entity: context.component || 'unknown',
      details: err.message,
      ip_address: null,
      outlet: 'koramangala',

      // Extended error-tracking columns (if available)
      entity_type: context.component || 'unknown',
      entity_id: null,
      changes: changesPayload,
      performed_by: context.userId || 'system',
    };

    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from('audit_logs').insert(payload);
      if (!error) break;

      if (error?.code === 'PGRST204') {
        const missingColumn = (error.message || '').match(/'([^']+)' column/)?.[1];
        if (missingColumn && missingColumn in payload) {
          delete payload[missingColumn];
          continue;
        }
      }

      throw error;
    }
  } catch (logErr) {
    // Silently fail — never let error tracking break the app
    console.warn('[ErrorTracking] Failed to persist error log:', logErr);
  }
}

export function captureException(error: Error | unknown, context?: ErrorContext): void {
  // Fire-and-forget
  trackError(error, context).catch(() => {});
}
