import type { Card, SiteAdapter } from './types';
import { isNonBeerName } from './non-beer';

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const ES_NON_BEER_RE =
  /\b(?:caja\s+sorpresa|pack\b|club\s+cervecero|soda\b|cola\b|tangerine|vaso|copa|camiseta|gorra|abridor|cata|taller|merch|regalo|tarjeta\s+de\s+regalo)\b/i;

const NON_BEER_PAGE_RE =
  /\/(?:catas-de-cerveza|blog-de-cerveza|distribucion|contacto|aviso-legal|politica-de-privacidad|carrito|finalizar-comprar|my-account)(?:[/?#]|$)/i;

const KNOWN_BREWERIES = [
  'Althaia',
  'Attik',
  'Garage',
  'La Quince',
  'La Sitgetana',
  'Montseny',
  'Octavo Arte',
  'Oddity',
  'Oso Brew Co.',
  'Oso Brew Co',
  'Oso Brew',
  'Río Azul',
  'Rio Azul',
  'Saez&Son',
  'Yakka',
  'Basqueland',
  'Cervezas Alhambra',
  'Deya',
  'Espiga',
  'FrauGruber',
  'Malandar',
];

function cleanBeerName(rawTitle: string, brewery: string): string {
  let name = rawTitle.replace(/\s+/g, ' ').trim();
  name = name.replace(/^[-–—:\s]+/, '').trim();
  const b = brewery.trim();
  if (b && name.toLowerCase().startsWith(b.toLowerCase())) {
    const stripped = name.slice(b.length).replace(/^[-–—:\s]+/, '').trim();
    if (stripped) {
      name = stripped;
    }
  }
  // Strip trailing volumes e.g. "33cl", "44cl", "50cl", "0,33l", "440ml"
  name = name.replace(/\s*\b\d+(?:[.,]\d+)?\s*(?:cl|ml|l)\b.*$/i, '').trim();
  return name;
}

function parseTitleParts(rawTitle: string): { brewery: string; name: string; style?: string } {
  const trimmed = rawTitle.replace(/\s+/g, ' ').trim();
  const parts = trimmed
    .split(/\s*(?:[\u2013\u2014]|\s-\s)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length >= 3) {
    const brewery = parts[0];
    const name = cleanBeerName(parts[1], brewery);
    const style = parts.slice(2).join(' – ');
    return { brewery, name, style };
  }

  if (parts.length === 2) {
    const brewery = parts[0];
    const name = cleanBeerName(parts[1], brewery);
    return { brewery, name };
  }

  // Fallback for single segment e.g. "Yakka Querida Ipa"
  for (const b of KNOWN_BREWERIES) {
    if (trimmed.toLowerCase().startsWith(b.toLowerCase())) {
      const namePart = trimmed.slice(b.length).trim();
      const cleaned = cleanBeerName(namePart, b);
      if (cleaned) {
        return { brewery: b, name: cleaned };
      }
    }
  }

  return { brewery: '', name: cleanBeerName(trimmed, '') };
}

export const bubblesbeers: SiteAdapter = {
  id: 'bubblesbeers',
  hostMatch: (url) => url.hostname === 'bubblesbeers.com' || url.hostname.endsWith('.bubblesbeers.com'),
  reRenderContainerSelector: 'ul.products',

  isNonBeerPage(url) {
    return NON_BEER_PAGE_RE.test(url.pathname);
  },

  parseCards(root) {
    const cards: Card[] = [];
    const items = Array.from(root.querySelectorAll<HTMLElement>('li.product'));

    for (const el of items) {
      const titleEl = el.querySelector<HTMLElement>('.woocommerce-loop-product__title');
      const rawTitle = text(titleEl);
      if (!rawTitle) continue;

      const catEl = el.querySelector<HTMLElement>('.ast-woo-product-category');
      const catText = text(catEl);

      const isNonBeer =
        isNonBeerName(rawTitle) ||
        ES_NON_BEER_RE.test(rawTitle) ||
        ES_NON_BEER_RE.test(catText) ||
        el.classList.contains('product_tag-soda') ||
        el.classList.contains('product_tag-cola') ||
        el.classList.contains('product_tag-caja-sorpresa') ||
        el.classList.contains('product_tag-pack-cervezas') ||
        el.classList.contains('product_tag-pack-degustacion') ||
        el.classList.contains('product_cat-packs');

      if (isNonBeer) {
        cards.push({ el, brewery: '', name: '', nonBeer: true });
        continue;
      }

      const { brewery, name, style } = parseTitleParts(rawTitle);
      const effectiveStyle = style || (catText && catText !== 'Packs' ? catText : undefined);

      cards.push({
        el,
        brewery,
        name,
        ...(effectiveStyle ? { style: effectiveStyle } : {}),
      });
    }

    return cards;
  },
};
