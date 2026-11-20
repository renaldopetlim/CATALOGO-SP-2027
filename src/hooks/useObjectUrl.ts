/**
 * Uma URL temporária (`blob:`) por arquivo, para pré-visualização.
 *
 * Fica em cache (WeakMap) em vez de ser criada/liberada num efeito: o React
 * pode montar e desmontar efeitos mais de uma vez (StrictMode), e liberar a URL
 * ali deixava a prévia quebrada. São poucos arquivos (fotos do formulário);
 * o navegador libera tudo ao sair da página.
 */
const cache = new WeakMap<File, string>();

export function objectUrlFor(file: File): string {
  let url = cache.get(file);
  if (!url) {
    url = URL.createObjectURL(file);
    cache.set(file, url);
  }
  return url;
}

export function useObjectUrl(file: File | null): string | null {
  return file ? objectUrlFor(file) : null;
}
