import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Module-level store so switching between Premex modules never loses the captured browser prompt
let capturedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

const notifyPromptListeners = () => {
  promptListeners.forEach((fn) => fn());
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    capturedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });

  window.addEventListener('appinstalled', () => {
    capturedDeferredPrompt = null;
    notifyPromptListeners();
  });
}

const detectIsStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone
  );
  return Boolean(displayModeStandalone || iosStandalone);
};

const detectPlatform = () => {
  if (typeof window === 'undefined') {
    return { isIOS: false, isAndroid: false, isMobile: false };
  }
  const ua = window.navigator.userAgent.toLowerCase();
  const isIPhoneOrIPod = /iphone|ipod/.test(ua);
  const isIPad =
    /ipad/.test(ua) ||
    (ua.includes('macintosh') && (window.navigator.maxTouchPoints || 0) > 1);
  const isIOS = isIPhoneOrIPod || isIPad;
  const isAndroid = /android/.test(ua);
  const isMobile = isIOS || isAndroid || /mobile/.test(ua);
  return { isIOS, isAndroid, isMobile };
};

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => capturedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectIsStandalone());
  const [platform] = useState(() => detectPlatform());

  useEffect(() => {
    const sync = () => {
      setDeferredPrompt(capturedDeferredPrompt);
      setIsInstalled(detectIsStandalone());
    };

    promptListeners.add(sync);

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayChange = () => setIsInstalled(detectIsStandalone());
    mediaQuery?.addEventListener?.('change', handleDisplayChange);

    const handleInstalled = () => {
      capturedDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener('appinstalled', handleInstalled);

    sync();

    return () => {
      promptListeners.delete(sync);
      mediaQuery?.removeEventListener?.('change', handleDisplayChange);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEvent = capturedDeferredPrompt || deferredPrompt;
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        capturedDeferredPrompt = null;
        setDeferredPrompt(null);
        setIsInstalled(true);
        notifyPromptListeners();
        return true;
      }
    } catch {
      // Prompt may only be invoked once
      capturedDeferredPrompt = null;
      setDeferredPrompt(null);
      notifyPromptListeners();
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS: platform.isIOS,
    isAndroid: platform.isAndroid,
    isMobile: platform.isMobile,
    install,
  };
}
