import { useState } from 'react';

type BrandLogoProps = {
  name: string;
  logoUrl: string | null | undefined;
  /** sm = card da vitrine; md = detalhes/tabela; lg = formulário. */
  size?: 'sm' | 'md' | 'lg';
  /** Esconde o texto alternativo quando o nome já aparece ao lado. */
  decorative?: boolean;
};

/** Iniciais da marca ("Tigre ADS" → "TA") para o fallback visual. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Logo da marca com fallback (iniciais) quando não há logo ou a imagem falha. */
export function BrandLogo({ name, logoUrl, size = 'md', decorative = false }: BrandLogoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(logoUrl) && failedUrl !== logoUrl;

  return (
    <span className={`brand-logo ${size}${showImage ? '' : ' fallback'}`} aria-hidden={decorative || undefined}>
      {showImage && logoUrl ? (
        <img src={logoUrl} alt={decorative ? '' : `Logo ${name}`} loading="lazy" decoding="async" onError={() => setFailedUrl(logoUrl)} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}
