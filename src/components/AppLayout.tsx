'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from './ErrorBoundary';
import { Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPath?: string;
}

// Auto-logout after 30 minutes of inactivity
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000; // warn 1 min before logout

export default function AppLayout({ children, currentPath = '' }: AppLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inactivityTimer = useRef<NodeJS.Timeout | null>(null);
  const warningTimer = useRef<NodeJS.Timeout | null>(null);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);
  const { signOut, user } = useAuth();
  const router = useRouter();

  const clearAllTimers = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
  }, []);

  const doLogout = useCallback(async () => {
    clearAllTimers();
    setShowInactivityWarning(false);
    try {
      await signOut();
    } catch {}
    router.push('/login');
  }, [signOut, router, clearAllTimers]);

  const resetInactivityTimer = useCallback(() => {
    if (!user) return;
    clearAllTimers();
    setShowInactivityWarning(false);

    // Set warning timer (fires 1 min before logout)
    warningTimer.current = setTimeout(() => {
      setShowInactivityWarning(true);
      setCountdown(60);
      countdownInterval.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(countdownInterval.current!);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Set logout timer
    inactivityTimer.current = setTimeout(() => {
      doLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, clearAllTimers, doLogout]);

  // Attach activity listeners
  useEffect(() => {
    if (!user) return;
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => resetInactivityTimer();

    resetInactivityTimer();
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));

    return () => {
      clearAllTimers();
      events.forEach((e) => window.removeEventListener(e, handleActivity));
    };
  }, [user, resetInactivityTimer, clearAllTimers]);

  // Close sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [currentPath]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:relative lg:flex lg:z-auto transition-transform duration-300 ease-in-out ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar currentPath={currentPath} onClose={() => setMobileSidebarOpen(false)} />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile topbar with hamburger */}
        <div className="flex items-center h-14 border-b border-border bg-card px-4 lg:hidden flex-shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mr-3"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-sm text-foreground">RestroOS</span>
        </div>

        {/* Desktop topbar */}
        <div className="hidden lg:block">
          <Topbar currentPath={currentPath} />
        </div>

        <main className="flex-1 overflow-auto scrollbar-thin">
          <ErrorBoundary componentName="AppLayout">
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* ── Inactivity Warning Modal ──────────────────────────────────── */}
      {showInactivityWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
                <span className="text-2xl font-bold font-mono text-amber-400">{countdown}</span>
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Session Expiring Soon</h3>
              <p className="text-sm text-muted-foreground mb-5">
                You&apos;ve been inactive. You&apos;ll be automatically logged out in{' '}
                <span className="font-semibold text-amber-400">{countdown} second{countdown !== 1 ? 's' : ''}</span>.
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={doLogout}
                  className="flex-1 py-2.5 bg-secondary border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Log Out Now
                </button>
                <button
                  onClick={resetInactivityTimer}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold text-white transition-all"
                >
                  Stay Signed In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}