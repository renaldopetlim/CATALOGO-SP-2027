/**
 * URL de um arquivo da pasta `public/`, respeitando o `base` do Vite.
 * Ex.: assetUrl('assets/logo.png') → '/CATALOGO-SP-2027/assets/logo.png'
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

/** Endereço da vitrine (raiz do site publicado). */
export const SITE_ROOT_URL = import.meta.env.BASE_URL;
