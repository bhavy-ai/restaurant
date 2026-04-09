'use client';
import { useEffect } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const RELOAD_KEY = 'restro_chunk_reload_once';

    const handleChunkError = () => {
      try {
        const hasReloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
        if (!hasReloaded) {
          sessionStorage.setItem(RELOAD_KEY, '1');
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    };

    const onError = (event: ErrorEvent) => {
      const message = event?.message || '';
      if (message.includes('ChunkLoadError') || message.includes('Loading chunk')) {
        handleChunkError();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const reasonMessage =
        typeof reason === 'string'
          ? reason
          : reason?.message || '';

      if (reasonMessage.includes('ChunkLoadError') || reasonMessage.includes('Loading chunk')) {
        handleChunkError();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {}
    };
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
