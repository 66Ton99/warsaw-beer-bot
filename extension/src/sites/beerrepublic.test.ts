import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beerrepublic } from './beerrepublic';

const html = readFileSync(
  resolve(__dirname, '../../tests/fixtures/beerrepublic.html'),
  'utf8',
);
const esHtml = readFileSync(
  resolve(__dirname, '../../tests/fixtures/beerrepublic-es.html'),
  'utf8',
);

function parseFixture() {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return beerrepublic.parseCards(doc);
}

function parseEsFixture() {
  const doc = new DOMParser().parseFromString(esHtml, 'text/html');
  return beerrepublic.parseCards(doc);
}

function product(title: string, vendor = 'Beer Republic'): string {
  return `
    <div class="product-item">
      <span class="product-item__vendor">${vendor}</span>
      <a class="product-item__title">${title}</a>
    </div>
  `;
}

let cards: ReturnType<typeof beerrepublic.parseCards>;
let esCards: ReturnType<typeof beerrepublic.parseCards>;
beforeAll(() => {
  cards = parseFixture();
  esCards = parseEsFixture();
});

describe('beerrepublic adapter', () => {
  it('parses many cards from the SSR grid (EU storefront)', () => {
    expect(cards.length).toBeGreaterThan(20);
  });

  it('does not define waitForGrid (SSR)', () => {
    expect(beerrepublic.waitForGrid).toBeUndefined();
  });

  it('marks non-beer pack, variety pack, and calendar products (EU)', () => {
    const doc = new DOMParser().parseFromString(`
      <section data-section-type="collection">
        ${product('Limited Edition Anniversary Vertical Set', 'Firestone Walker')}
        ${product("Firestone Walker Barrel Aged Brewer's Collective Brewery Pack", 'Firestone Walker')}
        ${product('Surprise Box Barrel Aged Beers')}
        ${product('Advent Calendar 2025 Green Edition')}
        ${product('Winter Break Variety Twelve Pack', 'Samuel Adams')}
        ${product('Mind Haze Galaxy Bender', 'Firestone Walker')}
      </section>
    `, 'text/html');

    const parsed = beerrepublic.parseCards(doc);
    expect(parsed.filter((card) => card.nonBeer)).toHaveLength(5);
    expect(parsed.filter((card) => !card.nonBeer).map((card) => card.name)).toEqual([
      'Mind Haze Galaxy Bender',
    ]);
    expect(parsed.filter((card) => card.nonBeer).every((card) => card.skip === undefined)).toBe(true);
  });

  it('parses cards from beerrepublic.es (ES storefront)', () => {
    expect(esCards.length).toBe(24);

    const nonBeer = esCards.filter((c) => c.nonBeer);
    expect(nonBeer).toHaveLength(2);

    const beerCards = esCards.filter((c) => !c.nonBeer);
    expect(beerCards).toHaveLength(22);

    // Every beer card must have a non-empty name and brewery
    for (const card of beerCards) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.brewery.length).toBeGreaterThan(0);
    }

    // Specific beer verification
    const armand = beerCards.find((c) => c.name.includes('Armand'));
    expect(armand).toBeDefined();
    expect(armand?.brewery).toBe('3 Fonteinen');
    expect(armand?.name).toBe('Cuvèe Armand & Gaston');
    expect(armand?.abv).toBe(6.2);
    expect(armand?.style).toBe('Gueuze');

    const alhambra = beerCards.find((c) => c.brewery === 'Alhambra');
    expect(alhambra).toBeDefined();
    expect(alhambra?.name).toBe('1925');
    expect(alhambra?.abv).toBe(6.4);
    expect(alhambra?.style).toBe('Pilsen');

    const akelarre = beerCards.find((c) => c.brewery === 'Almogàver' && c.name === 'Akelarre');
    expect(akelarre).toBeDefined();
    expect(akelarre?.abv).toBe(5.2);
    expect(akelarre?.style).toBe('Helles Rauch');
  });

  it('recovers untranslated beer name and brewery when browser translation modifies DOM text', () => {
    const doc = new DOMParser().parseFromString(`
      <script>
        var meta = {"products":[{"id":123,"handle":"hoegaarden-blanc-33cl","vendor":"Hoegaarden","variants":[{"name":"Hoegaarden Blanc"}]}]};
      </script>
      <section id="product-grid">
        <article class="io-ctabs__card">
          <a href="/products/hoegaarden-blanc-33cl" class="io-ctabs__card-title">Кугарден Блан</a>
          <div class="io-ctabs__specs-bar">
            <span class="io-ctabs__spec-inline">
              <span class="io-ctabs__spec-val">4.9%</span>
              <span class="io-ctabs__spec-label">ABV</span>
            </span>
          </div>
        </article>
      </section>
    `, 'text/html');

    const parsed = beerrepublic.parseCards(doc);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].brewery).toBe('Hoegaarden');
    expect(parsed[0].name).toBe('Blanc');
    expect(parsed[0].abv).toBe(4.9);
  });

  it('correctly resolves metadata even when parseCards is scoped to #product-grid container', () => {
    const doc = new DOMParser().parseFromString(`
      <script>
        var meta = {"products":[{"id":123,"handle":"hoegaarden-blanc-33cl","vendor":"Hoegaarden","variants":[{"name":"Hoegaarden Blanc"}]}]};
      </script>
      <div id="product-grid">
        <article class="io-ctabs__card">
          <a href="/products/hoegaarden-blanc-33cl" class="io-ctabs__card-title">Hoegaarden Blanc</a>
        </article>
      </div>
    `, 'text/html');

    const grid = doc.getElementById('product-grid')!;
    const parsed = beerrepublic.parseCards(grid);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].brewery).toBe('Hoegaarden');
    expect(parsed[0].name).toBe('Blanc');
  });
});
