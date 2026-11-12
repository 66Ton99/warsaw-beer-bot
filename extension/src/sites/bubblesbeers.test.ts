import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bubblesbeers } from './bubblesbeers';

const html = readFileSync(
  resolve(__dirname, '../../tests/fixtures/bubblesbeers.html'),
  'utf8',
);

function parseFixture() {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return bubblesbeers.parseCards(doc);
}

function card(title: string, category = '', extraClasses = ''): string {
  return `
    <li class="product type-product ${extraClasses}">
      <div class="astra-shop-summary-wrap">
        <span class="ast-woo-product-category">${category}</span>
        <a class="ast-loop-product__link">
          <h2 class="woocommerce-loop-product__title">${title}</h2>
        </a>
      </div>
    </li>
  `;
}

function parse(snippet: string) {
  const doc = new DOMParser().parseFromString(`<ul>${snippet}</ul>`, 'text/html');
  return bubblesbeers.parseCards(doc);
}

let cards: ReturnType<typeof bubblesbeers.parseCards>;
beforeAll(() => {
  cards = parseFixture();
});

describe('bubblesbeers adapter', () => {
  it('matches bubblesbeers.com and subdomains', () => {
    expect(bubblesbeers.hostMatch(new URL('https://bubblesbeers.com/shop/'))).toBe(true);
    expect(bubblesbeers.hostMatch(new URL('https://www.bubblesbeers.com/shop/'))).toBe(true);
    expect(bubblesbeers.hostMatch(new URL('https://other.com/'))).toBe(false);
  });

  it('identifies non-beer pages like catas, blog, and account', () => {
    expect(bubblesbeers.isNonBeerPage?.(new URL('https://bubblesbeers.com/catas-de-cerveza/'))).toBe(true);
    expect(bubblesbeers.isNonBeerPage?.(new URL('https://bubblesbeers.com/blog-de-cerveza/'))).toBe(true);
    expect(bubblesbeers.isNonBeerPage?.(new URL('https://bubblesbeers.com/shop/'))).toBe(false);
    expect(bubblesbeers.isNonBeerPage?.(new URL('https://bubblesbeers.com/categoria-producto/lupuladas/'))).toBe(false);
  });

  it('parses all products from live fixture', () => {
    expect(cards.length).toBe(12);

    const nonBeer = cards.filter((c) => c.nonBeer);
    expect(nonBeer).toHaveLength(1);
    expect(nonBeer[0].skip).toBeUndefined();

    const beerCards = cards.filter((c) => !c.nonBeer);
    expect(beerCards).toHaveLength(11);

    for (const c of beerCards) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.brewery.length).toBeGreaterThan(0);
    }
  });

  it('parses 3-segment title: Brewery – Name – Style', () => {
    const barlovento = cards.find((c) => c.name === 'Barlovento');
    expect(barlovento).toBeDefined();
    expect(barlovento?.brewery).toBe('Althaia');
    expect(barlovento?.style).toBe('Smoked Imperial Stout');

    const smile = cards.find((c) => c.name === 'Smile');
    expect(smile).toBeDefined();
    expect(smile?.brewery).toBe('Attik');
    expect(smile?.style).toBe('West Coast IPA sin gluten');

    const stef = cards.find((c) => c.name === 'Stef');
    expect(stef).toBeDefined();
    expect(stef?.brewery).toBe('Garage');
    expect(stef?.style).toBe('West Coast Pils');
  });

  it('parses 2-segment title: Brewery – Name', () => {
    const tostada = cards.find((c) => c.name === 'Mediterranean Tostada Sin Alcohol');
    expect(tostada).toBeDefined();
    expect(tostada?.brewery).toBe('Althaia');
    expect(tostada?.style).toBe('Maltosas');
  });

  it('parses single segment title matching known brewery', () => {
    const [c] = parse(card('Yakka Querida Ipa', 'American IPA'));
    expect(c.brewery).toBe('Yakka');
    expect(c.name).toBe('Querida Ipa');
    expect(c.nonBeer).toBeUndefined();
  });

  it('marks packs, surprise boxes, merchandise and sodas as non-beer', () => {
    const nonBeers = parse(`
      ${card('Caja Sorpresa 12 Cervezas Artesanas – Pack Degustación Variado', 'Packs')}
      ${card('Pack Garage Beer – Mecánicos del lúpulo', 'Packs')}
      ${card('Luno Soda – Retro Cola', 'Refrescos')}
      ${card('Bubbles Beer Club (Club Cervecero)', 'Club')}
      ${card('Copa Degustación Bubbles', 'Merch')}
    `);

    expect(nonBeers).toHaveLength(5);
    for (const c of nonBeers) {
      expect(c.nonBeer).toBe(true);
      expect(c.skip).toBeUndefined();
    }
  });
});
