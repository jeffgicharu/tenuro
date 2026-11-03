import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Box, { type BoxProps } from '@mui/material/Box';

// A frame that scrolls sideways when its content is wider, and fades whichever edge has more to
// show, so a table cut off at the edge reads as "scroll for more" rather than as clipped. Works in
// either direction: in right-to-left the start edge is on the right.
export function ScrollFrame({ children, sx, ...rest }: Omit<BoxProps, 'children'> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      // scrollLeft runs from 0 towards negative numbers in right-to-left.
      const x = Math.abs(el.scrollLeft);
      setFade((f) => {
        const next = { start: x > 1, end: max > 1 && x < max - 1 };
        return f.start === next.start && f.end === next.end ? f : next;
      });
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, []);

  // Written left to right on purpose: in right-to-left the stylesheet's RTL plugin mirrors
  // "to right" into "to left", so the start fade lands on the right and the end fade on the left.
  const mask = fade.start || fade.end
    ? `linear-gradient(to right, ${fade.start ? 'transparent 0, #000 40px' : '#000 0'}, ${fade.end ? '#000 calc(100% - 40px), transparent 100%' : '#000 100%'})`
    : undefined;

  return (
    <Box
      ref={ref}
      data-scroll-frame
      {...rest}
      sx={[{ overflowX: 'auto', maskImage: mask, WebkitMaskImage: mask }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Box>
  );
}
