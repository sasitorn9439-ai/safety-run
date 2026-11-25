export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from the page`);
  return el as T;
};

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c => ENT[c]!);

/** keeps a field to digits as people type or paste (employee ids are numbers only) */
export const digitsOnly = (el: HTMLInputElement) => {
  el.addEventListener('input', () => { const v = el.value.replace(/\D/g, ''); if (v !== el.value) el.value = v; });
};
