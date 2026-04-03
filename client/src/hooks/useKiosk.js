import { useState, useEffect, useCallback } from 'react';

const KIOSK_KEY = 'nb_kiosk';

export function useKiosk() {
  const [kiosk, setKiosk] = useState(() => localStorage.getItem(KIOSK_KEY) === 'true');
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const setKioskMode = useCallback((enabled) => {
    if (enabled) {
      localStorage.setItem(KIOSK_KEY, 'true');
    } else {
      localStorage.removeItem(KIOSK_KEY);
    }
    setKiosk(enabled);
  }, []);

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  return { kiosk, setKioskMode, isFullscreen, enterFullscreen, exitFullscreen };
}
