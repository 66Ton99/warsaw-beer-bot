import type { Card, SiteAdapter } from './types';
import { isNonBeerName } from './non-beer';
import { usableAbv } from '../shared/abv';

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

const ES_NON_BEER_RE =
  /\b(?:abridor|alfombrilla|vaso|copa|gorra|placa|growler|camiseta|llavero|cartel|posavasos|calendario\s+de\s+adviento)\b/i;
const ES_PACKAGE_RE = /\b(?:pack\s+.*de\s+regalo|caja\s+\d+x\d+cl\s*\+)\b/i;

interface MetaProduct {
  vendor: string;
  name?: string;
}

function parseMetaProducts(root: ParentNode): Map<string, MetaProduct> {
  const map = new Map<string, MetaProduct>();
  const doc: ParentNode =
    'ownerDocument' in root && (root as Node).ownerDocument
      ? (root as Node).ownerDocument!
      : root;
  for (const s of Array.from(doc.querySelectorAll('script'))) {
    const content = s.textContent;
    if (!content || !content.includes('var meta =')) continue;
    const match =
      content.match(/var\s+meta\s*=\s*(\{.*?\n\s*\});/s) ||
      content.match(/var\s+meta\s*=\s*(\{.*?\});/s);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data.products)) {
          for (const p of data.products) {
            if (p?.handle) {
              const vendor = p.vendor ? String(p.vendor).trim() : '';
              const variantName =
                p.variants?.[0]?.name && p.variants[0].name !== 'Default Title'
                  ? String(p.variants[0].name).trim()
                  : undefined;
              const title =
                p.title && p.title !== 'Default Title'
                  ? String(p.title).trim()
                  : undefined;
              map.set(p.handle, {
                vendor,
                name: variantName || title,
              });
            }
          }
        }
      } catch {
        // ignore JSON parse error
      }
    }
  }
  return map;
}

function getFilterVendors(root: ParentNode): string[] {
  const vendors = new Set<string>();
  const doc: ParentNode =
    'ownerDocument' in root && (root as Node).ownerDocument
      ? (root as Node).ownerDocument!
      : root;
  for (const input of Array.from(doc.querySelectorAll<HTMLInputElement>('input[name="filter.p.vendor"]'))) {
    const v = input.value?.trim();
    if (v) vendors.add(v);
  }
  return Array.from(vendors).sort((a, b) => b.length - a.length);
}

function cleanBeerName(rawTitle: string, brewery: string): string {
  let name = rawTitle.replace(/\s+/g, ' ').trim();
  const b = brewery.trim();
  if (b && name.toLowerCase().startsWith(b.toLowerCase())) {
    const stripped = name.slice(b.length).replace(/^[-–—:\s]+/, '').trim();
    if (stripped) {
      name = stripped;
    }
  }
  // Strip volume indicators e.g. "33cl", "0,33l", "500ml" at word boundaries
  name = name.replace(/\s*\b\d+(?:[.,]\d+)?\s*(?:cl|ml|l)\b/gi, '').trim();
  return name;
}

function parseEsAbv(cardEl: HTMLElement): number | undefined {
  for (const spec of Array.from(cardEl.querySelectorAll('.io-ctabs__spec-inline'))) {
    const label = text(spec.querySelector('.io-ctabs__spec-label'));
    if (/abv/i.test(label)) {
      const valText = text(spec.querySelector('.io-ctabs__spec-val'))
        .replace('%', '')
        .replace(',', '.')
        .trim();
      const num = Number(valText);
      if (Number.isFinite(num)) {
        return usableAbv(num);
      }
    }
  }
  return undefined;
}

function parseEsStyle(cardEl: HTMLElement): string | undefined {
  const styleEl = cardEl.querySelector('.io-ctabs__beer-type-badge');
  const style = text(styleEl);
  return style || undefined;
}

export const beerrepublic: SiteAdapter = {
  id: 'beerrepublic',
  hostMatch: (url) =>
    url.hostname === 'beerrepublic.eu' ||
    url.hostname.endsWith('.beerrepublic.eu') ||
    url.hostname === 'beerrepublic.es' ||
    url.hostname.endsWith('.beerrepublic.es'),
  reRenderContainerSelector: 'section[data-section-type="collection"], #product-grid, .io-grid',

  parseCards(root) {
    const cards: Card[] = [];

    // 1. EU storefront cards (.product-item)
    const euItems = Array.from(root.querySelectorAll<HTMLElement>('.product-item'));
    if (euItems.length > 0) {
      for (const el of euItems) {
        const name = text(el.querySelector('.product-item__title'));
        if (!name) continue;
        if (isNonBeerName(name)) {
          cards.push({ el, brewery: '', name: '', nonBeer: true });
          continue;
        }
        const brewery = text(el.querySelector('.product-item__vendor'));
        cards.push({ el, brewery, name });
      }
      return cards;
    }

    // 2. ES storefront cards (.io-ctabs__card)
    const esItems = Array.from(root.querySelectorAll<HTMLElement>('.io-ctabs__card'));
    if (esItems.length > 0) {
      const metaMap = parseMetaProducts(root);
      const filterVendors = metaMap.size === 0 ? getFilterVendors(root) : [];

      for (const el of esItems) {
        const titleEl = el.querySelector<HTMLAnchorElement>('.io-ctabs__card-title');
        const rawName = text(titleEl);
        if (!rawName) continue;

        if (isNonBeerName(rawName) || ES_NON_BEER_RE.test(rawName) || ES_PACKAGE_RE.test(rawName)) {
          cards.push({ el, brewery: '', name: '', nonBeer: true });
          continue;
        }

        const href =
          titleEl?.getAttribute('href') ??
          el.querySelector<HTMLAnchorElement>('a.io-ctabs__card-media')?.getAttribute('href') ??
          '';
        const handleMatch = href.match(/\/products\/([^?#/]+)/);
        const handle = handleMatch ? handleMatch[1] : '';

        const metaProd = handle ? metaMap.get(handle) : undefined;
        let brewery = metaProd?.vendor ?? '';
        if (!brewery && filterVendors.length > 0) {
          const lowerName = rawName.toLowerCase();
          for (const vendor of filterVendors) {
            if (lowerName.startsWith(vendor.toLowerCase())) {
              brewery = vendor;
              break;
            }
          }
        }

        // Prefer untranslated name from storefront metadata if available
        // (resilient to browser auto-translation e.g. Chrome Translate)
        const nameSource = metaProd?.name || rawName;
        const name = cleanBeerName(nameSource, brewery);
        const abv = parseEsAbv(el);
        const style = parseEsStyle(el);

        cards.push({
          el,
          brewery,
          name,
          ...(abv !== undefined ? { abv } : {}),
          ...(style ? { style } : {}),
        });
      }
      return cards;
    }

    return cards;
  },

  async loadCardDetails(cards) {
    for (const card of cards) {
      if (card.brewery) continue;
      const a = card.el.querySelector<HTMLAnchorElement>('.io-ctabs__card-title, .io-ctabs__card-media');
      if (!a?.href) continue;
      try {
        const res = await fetch(a.href);
        if (!res.ok) continue;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const vendorEl = doc.querySelector('.br-pdp__vendor-name, [data-vendor], .product-item__vendor');
        const vendor = text(vendorEl);
        if (vendor) {
          card.brewery = vendor;
          card.name = cleanBeerName(card.name, vendor);
        }
      } catch {
        // fallback if detail page is unreachable
      }
    }
  },
};
