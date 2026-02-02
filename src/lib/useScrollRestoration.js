import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "ncaab-scroll-positions";

/**
 * Hook to save and restore scroll positions per route.
 * Saves to sessionStorage so positions persist across page reloads
 * but clear when the browser tab is closed.
 */
export function useScrollRestoration() {
  const location = useLocation();
  const isRestoring = useRef(false);

  // Get stored positions from sessionStorage
  const getStoredPositions = () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  // Save position for current route
  const savePosition = () => {
    if (isRestoring.current) return;
    
    const positions = getStoredPositions();
    positions[location.pathname] = window.scrollY;
    
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {
      // sessionStorage might be full or disabled
    }
  };

  // Restore position for current route
  const restorePosition = () => {
    const positions = getStoredPositions();
    const savedPosition = positions[location.pathname];
    
    if (savedPosition !== undefined && savedPosition > 0) {
      isRestoring.current = true;
      
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
        // Small delay before allowing saves again
        setTimeout(() => {
          isRestoring.current = false;
        }, 100);
      });
    }
  };

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    let timeoutId;
    
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(savePosition, 100);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("scroll", handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Save position before page unload (user leaves site)
  useEffect(() => {
    const handleBeforeUnload = () => {
      savePosition();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Save position when route changes
  useEffect(() => {
    // Save the previous route's position before navigating
    return () => {
      savePosition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Restore position when route changes
  useEffect(() => {
    // Small delay to ensure page content has loaded
    const timeoutId = setTimeout(restorePosition, 50);
    
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
}

