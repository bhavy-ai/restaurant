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
    await supabase.from('audit_logs').insert({
      action: context.action || 'client_error',
      entity_type: context.component || 'unknown',
      entity_id: null,
      changes: {
        error_message: err.message,
        error_stack: err.stack?.slice(0, 2000) || null,
        component: context.component || null,
        action: context.action || null,
        extra: context.extra || null,
        url: typeof window !== 'undefined' ? window.location.pathname : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        timestamp: new Date().toISOString(),
      },
      performed_by: context.userId || 'system',
      outlet: 'koramangala',
    });
  } catch (logErr) {
    // Silently fail — never let error tracking break the app
    console.warn('[ErrorTracking] Failed to persist error log:', logErr);
  }
}

export function captureException(error: Error | unknown, context?: ErrorContext): void {
  // Fire-and-forget
  trackError(error, context).catch(() => {});
}
