import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

// Property photos are stored as /static/photos/<set>/<name>.jpg; smaller AVIF and JPEG sizes sit beside them.
export function PropertyPhoto({ src, alt, sizes, sx, eager = false }: { src: string; alt: string; sizes: string; sx?: SxProps<Theme>; eager?: boolean }) {
  const base = src.replace(/\.jpg$/, '');
  return (
    <Box component="picture" sx={{ display: 'block', overflow: 'hidden', ...sx }}>
      <source type="image/avif" srcSet={`${base}-800.avif 800w, ${base}-1600.avif 1600w`} sizes={sizes} />
      <Box
        component="img"
        src={`${base}-800.jpg`}
        srcSet={`${base}-800.jpg 800w, ${base}-1600.jpg 1600w`}
        sizes={sizes}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        width={1600}
        height={1067}
        sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </Box>
  );
}
