import { useEffect, useRef } from 'react';
import { useNavigationType } from 'react-router';

// A new page opens at the top (after saving the lease form, the lease page used to open scrolled
// to wherever the form was). Back and forward leave the browser's own restoration alone.
export function useScrollToTopOnNavigate(pathname: string) {
  const type = useNavigationType();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (type !== 'POP') window.scrollTo({ top: 0, left: 0 });
  }, [pathname, type]);
}
