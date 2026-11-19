import { useState } from 'react';

type ItemImageProps = {
  src: string | null;
  alt: string;
  /** `eager` para a imagem principal do modal; `lazy` nas grades. */
  loading?: 'lazy' | 'eager';
};

/** Imagem do item com fallback "Sem imagem" (URL vazia ou quebrada). */
export function ItemImage({ src, alt, loading = 'lazy' }: ItemImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return <div className="no-image">Sem imagem</div>;
  }

  return <img src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailedSrc(src)} />;
}
