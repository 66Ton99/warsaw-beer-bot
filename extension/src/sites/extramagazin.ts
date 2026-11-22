import type { Card, SiteAdapter } from './types';
import { isNonAlcoholicSoftDrinkFamily, isNonBeerName } from './non-beer';

const CARD_SELECTOR = 'article.js-product-miniature';
const CONTAINER_SELECTOR = '#js-product-list';

const LANG_PREFIX_RE = /^\/(?:uk|ca|ru|pl|ro)(?=\/|$)/i;

// Blacklist whole non-beer supermarket categories and non-beer product pages instead of
// whitelisting beer routes, so promotions, search paths, mead, or unexpected listing routes keep overlays.
const NON_BEER_PAGE_RE =
  /^(?:\/(?:caviar|vodka|alcohol-fuerte|licores|licores-de-infusion-y-balsamos|vino|bebidas-suaves|agua|snacks|pan|productos-ahumados|requeson|nata-y-crema|pescado-seco-y-curado|te|cafe|pelmeni-y-khinkali|syrniki|pepinos|tomates|setas|souvenirs|frutas-y-verduras|lacteos|carnes-y-embutidos|dulces|conservas|cereales)(?:\/|$))/i;

const NON_BEER_HREF_RE =
  /\/products\/(?:caviar-|vodka-|alcohol-fuerte-|vino-|licor(?:es)?-|whisky-|ron-|conac-|brandy-|tequila-|ginebra-|champan-|espumoso-|bebida-alcoholica-|bebida-energetica-|refresco-(?!fermentado-de-pan-)|zumo-|agua-|leche-|kefir-|kombucha-|te-|cafe-|queso-|pan-|pelmeni-|khinkali-|syrniki-|pescado-|salchich|embutido|carne-|pollo-|mantequilla-|nata-|crema-|requeson-|pepinos-|tomates-|setas-|chocolate-|dulces-|galletas-|helado-|souvenir)/i;

// `bebida fermentada` must carry `kvas` so kombucha/kefir drinks are never misclassified as kvass;
// `refresco fermentado de pan` is the shop's Spanish translation for bread kvass.
const BEVERAGE_HREF_RE =
  /\/products\/(?:cerveza-|sidra-|kvas-|refresco-fermentado-de-pan-|bebida-fermentada-kvas-|hidromiel-|radler-)/i;
const KVASS_TITLE_PREFIX_RE =
  /^\s*(?:квас|kwas(?:\s+chlebowy)?|kvas|cvas|refresco\s+fermentado\s+de\s+pan|bebida\s+fermentada\s+kvas)(?![\p{L}\p{N}])/iu;
const BEVERAGE_TITLE_PREFIX_RE =
  /^\s*(?:пиво|cerveza|cervesa|piwo|bere|квас|kwas(?:\s+chlebowy)?|kvas|cvas|refresco\s+fermentado\s+de\s+pan|bebida\s+fermentada\s+kvas|сидр|sidra|cydr|cidru|медовуха|мед\s+питний|hidromiel|aiguamel|mi[oó]d\s+pitny|mied|mead|радлер|radler)(?![\p{L}\p{N}])/iu;
// Keep mead and radler prefixes intact inside the beer name (e.g. "Медовуха", "Radler лимон").
const STRIP_CATEGORY_PREFIX_RE =
  /^\s*(?:пиво|cerveza|cervesa|piwo|bere|квас|kwas(?:\s+chlebowy)?|kvas|cvas|refresco\s+fermentado\s+de\s+pan|bebida\s+fermentada\s+kvas|сидр|sidra|cydr|cidru)(?:\s+|$)/iu;

const MARCAS_VARIADAS_RE = /^marcas\s+variadas$/i;
// Extra Magazin occasionally drops a decimal separator in localized titles ("KOZEL CIEMNE 3 8%");
// exclude "Pack 6 5%" style pack counts before matching two-part ABVs.
const ABV_EXTRACT_RE = /(?<![\d.,x×х])(?<!(?:pack|пак|уп)\.?\s)(\d)\s+(\d)\s*%|(\d+(?:[.,]\d+)?)\s*%/iu;
const ABV_CLEAN_RE = /(?<![\d.,x×х])(?<!(?:pack|пак|уп)\.?\s)\d\s+\d\s*%|\d+(?:[.,]\d+)?\s*%/giu;
const VOLUME_RE = /(?:\d+\s*[x×х]\s*\.?)?\d+(?:[.,]\d+)?\s*(?:мл|ml|л|l)(?![\p{L}\p{N}])/iu;
const TAIL_START_RE =
  /(?:(?<![\p{L}\p{N}])(?:розливне|розливний|разливное|разливной|de\s+barril|lane|la\s+draft\.?|ж\s*\/?\s*б|з\s*\/?\s*б|lata|puszk[ai]|doz[eă])\s+)?(?:\d+\s*[x×х]\s*\.?)?\d+(?:[.,]\d+)?\s*(?:мл|ml|л|l)(?![\p{L}\p{N}])/iu;
const TAIL_PACKAGING_RE =
  /(?<![\p{L}\p{N}])(?:ж\s*\/?\s*б|з\s*\/?\s*б|lata|puszk[ai]|doz[eă])(?![\p{L}\p{N}])/giu;
const LEADING_DESCRIPTOR_RE =
  /^(?:світле|темне|безалкогольне|светлое|темное|безалкогольное|clara|claro|rubia|oscura|sin\s+alcohol|jasne|ciemne|bezalkoholowe|blond[aă]|brun[aă]|f[aă]r[aă]\s+alcool)(?=\s+\S)/iu;
const TRAILING_NA_DESCRIPTOR_RE =
  /(?<=\S\s)(?:безалкогольне|безалкогольное|sin\s+alcohol|bezalkoholowe|f[aă]r[aă]\s+alcool)$/iu;
const NA_DESCRIPTOR_RE =
  /(?<![\p{L}\p{N}])(?:безалкогольн\p{L}*|sin\s+alcohol|bezalkoholow\p{L}*|f[aă]r[aă]\s+alcool)(?![\p{L}\p{N}])/iu;
const SINGLE_COLOR_DESCRIPTOR_RE =
  /^(?:світле|темне|светлое|темное|clara|claro|rubia|oscura|jasne|ciemne|blond[aă]|brun[aă])$/iu;
const KVASS_LIVE_FERMENTATION_RE =
  /(?<![\p{L}\p{N}])живого\s+(?:бродіння|брожения)(?![\p{L}\p{N}])/giu;

const CYRILLIC_TO_LATIN_MAP: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ъ: '',
  ю: 'iu',
  я: 'ia',
  ё: 'io',
  ы: 'y',
  э: 'e',
  ў: 'u',
};

function transliterateCyrillic(input: string): string {
  const chars = Array.from(input);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN_MAP[lower];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    if (!mapped) continue;
    const isUpper = ch !== lower;
    if (!isUpper) {
      out += mapped;
      continue;
    }
    const prev = chars[i - 1];
    const next = chars[i + 1];
    const nextUpper = Boolean(next && next !== next.toLowerCase());
    const prevUpper = Boolean(prev && prev !== prev.toLowerCase());
    out += nextUpper || (prevUpper && !next) ? mapped.toUpperCase() : `${mapped[0].toUpperCase()}${mapped.slice(1)}`;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Spanish product slugs are identical across all 6 storefront locales (/, /uk, /pl, /ca, /ru, /ro).
// Keys strip pack size, volume, and container tokens via productKey() while preserving ABV in the
// slug so 0.0% variants never collide with alcoholic releases on relisted pack sizes.
// Entries cover storefront-translated style names or distributor-substituted brands, pinned to Untappd bids.
const NORMALIZED_SLUG_OVERRIDES: Readonly<Record<string, { brewery: string; name: string }>> = {
  // Untappd bid 5788430: Warka Energy Original is filed under parent Grupa Żywiec rather than Browar Warka.
  'cerveza-00-energy-original-sin-alcohol-warka': {
    brewery: 'Grupa Żywiec',
    name: 'Warka Energy Original',
  },
  // Untappd bid 70150: Pivovar Velké Popovice — Kozel Černý / Dark (shop writes "ЧОРНЕ"/"NEGRO"/"CIEMNE").
  'cerveza-negro-38-kozel': {
    brewery: 'Pivovar Velké Popovice',
    name: 'Kozel Černý / Dark',
  },
  // Untappd bid 30101: Pivovar Velké Popovice — Kozel Premium Lager / Kozel 11 (shop writes "світле"/"claro"/"jasne").
  'cerveza-kozel-claro-46': {
    brewery: 'Pivovar Velké Popovice',
    name: 'Kozel Premium Lager / Kozel 11',
  },
  // Untappd bid 6677906: Perła - Browary Lubelskie S.A. — Perła Mango z Marakują (shop typos "Mago con maracuya").
  'cerveza-mago-con-maracuya-4-perla': {
    brewery: 'Perła - Browary Lubelskie S.A.',
    name: 'Perła Mango z Marakują',
  },
  // Untappd bid 1409: Tyskie Browary Książęce — Tyskie Gronie (shop puts "BROWARY KSIAZECE" as beer name).
  'cerveza-browary-ksiazece-55-tyskie': {
    brewery: 'Tyskie Browary Książęce',
    name: 'Tyskie Gronie',
  },
  // Untappd bid 31468: Ursus Breweries SA — Ursus Premium (shop writes "традиційний лагер"/"blonde lager").
  'cerveza-ursus-premium-blonde-lager-50': {
    brewery: 'Ursus Breweries SA',
    name: 'Ursus Premium',
  },
  // Untappd bid 6650446: Browar Łomża — Łomża Mocna Wiśnia 9% (shop translates "зі смаком вишні"/"con sabor a cereza").
  'cerveza-clara-con-sabor-a-cereza-90-lomza': {
    brewery: 'Browar Łomża',
    name: 'Łomża Mocna Wiśnia 9%',
  },
  // Untappd bid 2630288: Browar Łomża — Łomża 0,0% (shop appends bottling producer VAN PUR).
  'cerveza-clara-lomza-00-van-pur': {
    brewery: 'Browar Łomża',
    name: 'Łomża 0,0%',
  },
  // Untappd bid 396095: Browar Namysłów — Namysłów Pils (shop lists owner ZYWIEC as manufacturer).
  'cerveza-clara-namyslow-58-zywiec': {
    brewery: 'Browar Namysłów',
    name: 'Namysłów Pils',
  },
  // Untappd bid 316140: AB InBev Efes — Stary Melnik Iz Bochonka Myagkoe (shop translates "бочкове м'яке").
  'cerveza-suave-43-stary-melnik': {
    brewery: 'AB InBev Efes',
    name: 'Stary Melnik Iz Bochonka Myagkoe (Старый Мельник Из Бочонка Мягкое)',
  },
  // Untappd bid 259115: Lidskae Piva (Лідскае Піва) — Zhigulevskoe special (Жигулевское Специальное).
  'cerveza-clara-zhigulevskoe-52-lida': {
    brewery: 'Lidskae Piva (Лідскае Піва)',
    name: 'Zhigulevskoe special (Жигулевское Специальное)',
  },
  // Untappd bid 3238605: Global Beer Georgia — Kayaki (shop hides brewery under "Marcas variadas").
  'cerveza-clara-47-kayaki': {
    brewery: 'Global Beer Georgia',
    name: 'Kayaki',
  },
  // Untappd bid 50013: Carlsberg Ukraine — Lvivske 1715 (Львівське 1715) (bare "1715" fails matcher).
  'cerveza-1715-45-lvivske': {
    brewery: 'Carlsberg Ukraine',
    name: 'Lvivske 1715',
  },
  // Untappd bid 4957154: Carlsberg Ukraine — Львівське 1715 Безалкогольне.
  'cerveza-sin-alcohol-1715-00-lvivske': {
    brewery: 'Carlsberg Ukraine',
    name: 'Львівське 1715 Безалкогольне',
  },
  // Untappd bid 427481: Carlsberg Ukraine — Lvivske Blonde (Львівське Свiтле) (Untappd uses Latin "i").
  'cerveza-clara-svitlo-37-lvivske': {
    brewery: 'Carlsberg Ukraine',
    name: 'Lvivske Blonde',
  },
  // Untappd bid 5237230: AB InBev Efes Ukraine — Чернігівське Light (bare "Light" fails matcher).
  'cerveza-clara-chernigivske-light-43': {
    brewery: 'AB InBev Efes Ukraine',
    name: 'Чернігівське Light',
  },
  // Untappd bid 346974: Опілля (Opillia) — Корифей (Koryfei) (shop transliterates "Korifey export").
  'cerveza-clara-korifey-export-42-opillia': {
    brewery: 'Опілля (Opillia)',
    name: 'Корифей (Koryfei)',
  },
  // Untappd bid 6249716: Опілля (Opillia) — Білий Келих (shop transliterates "Bily kalykh").
  'cerveza-clara-bily-kalykh-42-opillia': {
    brewery: 'Опілля (Opillia)',
    name: 'Білий Келих (Bilyi Kelykh)',
  },
  // Untappd bid 6251265: Опілля (Opillia) — Хмелевар (shop transliterates "Khmelevar" on non-UK locales).
  'cerveza-rubia-khmelevar-42-opillia': {
    brewery: 'Опілля (Opillia)',
    name: 'Хмелевар (Khmelevar)',
  },
  // Untappd bid 2784378: Опілля (Opillia) — Квас Білий.
  'bebida-fermentada-kvas-blanco-opillia': {
    brewery: 'Опілля (Opillia)',
    name: 'Квас Білий (Kvas Bilyi)',
  },
  // Untappd bid 6216762: Опілля (Opillia) — Квас Чорний.
  'refresco-fermentado-de-pan-kvas-negro-opillia': {
    brewery: 'Опілля (Opillia)',
    name: 'Квас Чорний (Kvas Chornyi)',
  },
  // Untappd bid 5873830: Опілля (Opillia) — Квас Домашній.
  'bebida-fermentada-kvas-domashniy-opillia': {
    brewery: 'Опілля (Opillia)',
    name: 'Квас Домашній (Kvas Domashnii)',
  },
  // Untappd bid 1515439: Carlsberg Ukraine — Kvass Taras Chornyi (Квас Тарас Чорний) (shop files under KAYAKI).
  'kvas-taras-negro-kayaki': {
    brewery: 'Carlsberg Ukraine',
    name: 'Kvass Taras Chornyi (Квас Тарас Чорний)',
  },
  // Untappd bid 430164: Lidskae Piva (Лідскае Піва) — Lidski Dark kvass (Квас Лидский Темный).
  'kvas-oscuro-lidskiy': {
    brewery: 'Lidskae Piva (Лідскае Піва)',
    name: 'Lidski Dark kvass (Квас Лидский Темный)',
  },
  // Untappd bid 430164: alternate Spanish slug for Lidski Dark kvass.
  'refresco-fermentado-de-pan-lidskiy-oscuro': {
    brewery: 'Lidskae Piva (Лідскае Піва)',
    name: 'Lidski Dark kvass (Квас Лидский Темный)',
  },
  // Untappd bid 473058: Lidskae Piva (Лідскае Піва) — Lidski bread kvass (Квас Лидский Хлебный).
  'refresco-fermentado-de-pan-lidskiy-jlebniy': {
    brewery: 'Lidskae Piva (Лідскае Піва)',
    name: 'Lidski bread kvass (Квас Лидский Хлебный)',
  },
};

const CANONICAL_BREWERIES: Readonly<Record<string, string>> = {
  chernigivske: 'AB InBev Efes Ukraine', // bid 5237230
  kozel: 'Pivovar Velké Popovice', // bid 30101, 70150
  lech: 'Lech Browary Wielkopolski', // bid 29306
  lida: 'Lidskae Piva (Лідскае Піва)', // bid 259115
  lidskiy: 'Lidskae Piva (Лідскае Піва)', // bid 430164, 473058
  lomza: 'Browar Łomża', // bid 2630288, 6650446
  lvivske: 'Carlsberg Ukraine', // bid 427481, 50013, 4957154
  opillia: 'Опілля (Opillia)', // bid 346974, 4221760, 4508610, 6249716
  perla: 'Perła - Browary Lubelskie S.A.', // bid 20963, 6677906
  'stary melnik': 'AB InBev Efes', // bid 316140
  tyskie: 'Tyskie Browary Książęce', // bid 1409
  ursus: 'Ursus Breweries SA', // bid 31468
  'volfas engelman': 'Volfas Engelman', // bid 1517697, 2073098
  warka: 'Browar Warka',
  // Keep 'Żywiec' instead of 'Grupa Żywiec' here: sending 'Grupa Żywiec' / 'Żywiec' at 5.6% ABV
  // resolves to 'Żywiec APA' (bid 828396) in the server catalog instead of the flagship lager (bid 10519).
  zywiec: 'Żywiec',
};

const BREWERY_VARIANTS: Record<string, readonly string[]> = {
  lomza: ['ŁOMŻA'],
  lidskiy: ['ЛІДСЬКИЙ', 'ЛИДСКИЙ'],
  lvivske: ['ЛЬВІВСЬКЕ', 'ЛЬВОВСКОЕ'],
  opillia: ['ОПІЛЛЯ', 'ОПИЛЛЯ'],
  chernigivske: ['ЧЕРНІГІВСЬКЕ', 'ЧЕРНИГОВСКОЕ'],
};

function text(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizedPathname(rawUrl: string): string {
  try {
    return new URL(rawUrl, 'https://extramagazin.es').pathname;
  } catch {
    return rawUrl;
  }
}

function productKey(href: string): string {
  const match = normalizedPathname(href).match(/\/products\/([^/]+?)\.html$/i);
  if (!match) return '';
  return match[1]
    .toLowerCase()
    .replace(/-(?:\d+x)?\d+-(?:ml|l)(?=-|$)/gi, '')
    .replace(/-(?:\d+x)?\d+(?:ml|l)(?=-|$)/gi, '')
    .replace(/-(?:lata|de-barril)(?=-|$)/gi, '');
}

// Note: JSON-LD ItemList in <head> is only populated on the initial SSR document and does not update
// on PrestaShop AJAX pagination or filtering; cards loaded dynamically fall back to a.product_name[title].
function itemListTitles(root: ParentNode): Map<string, string> {
  const searchRoot: ParentNode = (root as Node).ownerDocument ?? root;
  const titles = new Map<string, string>();

  for (const script of Array.from(searchRoot.querySelectorAll('script[type="application/ld+json"]'))) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as {
        '@type'?: string;
        itemListElement?: Array<{ name?: string; url?: string }>;
      };
      if (parsed['@type'] !== 'ItemList' || !Array.isArray(parsed.itemListElement)) continue;
      for (const item of parsed.itemListElement) {
        if (typeof item.url !== 'string' || typeof item.name !== 'string') continue;
        const clean = decodeHtmlEntities(item.name).replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        titles.set(item.url, clean);
        titles.set(normalizedPathname(item.url), clean);
      }
    } catch {
      // Ignore malformed JSON-LD blocks and rely on DOM attributes.
    }
  }

  return titles;
}

function resolveRawTitle(
  el: HTMLElement,
  linkEl: HTMLAnchorElement | null,
  href: string,
  jsonLdTitles: Map<string, string>,
): string {
  const titleAttr = linkEl?.getAttribute('title')?.replace(/\s+/g, ' ').trim() ?? '';
  if (titleAttr && !titleAttr.endsWith('...')) return titleAttr;

  if (href) {
    const fromJsonLd = jsonLdTitles.get(href) ?? jsonLdTitles.get(normalizedPathname(href));
    if (fromJsonLd) return fromJsonLd;
  }

  return titleAttr || text(linkEl) || text(el.querySelector('.product_desc h3'));
}

function parseAbv(rawTitle: string): number | undefined {
  const match = rawTitle.match(ABV_EXTRACT_RE);
  if (!match) return undefined;
  const numeric = match[1] && match[2] ? `${match[1]}.${match[2]}` : match[3].replace(',', '.');
  const abv = Number(numeric);
  return Number.isFinite(abv) ? abv : undefined;
}

function cleanTailBrewery(rawTail: string): string {
  return rawTail
    .replace(ABV_CLEAN_RE, ' ')
    .replace(TAIL_PACKAGING_RE, ' ')
    .replace(/(?<=\p{L})"(?=\p{L})/gu, "'")
    .replace(/["«»„“”]/gu, '')
    .replace(/^[\s.,/-]+|[\s.,/-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTailBrewery(rawTitle: string): string {
  const match = rawTitle.match(VOLUME_RE);
  if (!match || match.index === undefined) return '';
  return cleanTailBrewery(rawTitle.slice(match.index + match[0].length));
}

function brandForms(brewery: string): string[] {
  const trimmed = brewery.trim();
  if (!trimmed) return [];
  const extras = BREWERY_VARIANTS[trimmed.toLocaleLowerCase('uk-UA')] ?? [];
  return [trimmed, ...extras];
}

// Keep brand tokens that belong to the beer name (e.g. "PERLA CHMIELOWA", "LECH PREMIUM",
// "Estrella Damm") and only drop a leading brand repeat on kvass or bare brand+color titles.
function stripLeadingBrandWhenRedundant(value: string, brewery: string, isKvass: boolean): string {
  const lower = value.toLocaleLowerCase('uk-UA');
  for (const form of brandForms(brewery)) {
    const formLower = form.toLocaleLowerCase('uk-UA');
    if (!lower.startsWith(`${formLower} `)) continue;
    const rest = value.slice(form.length).trim();
    if (!rest) continue;
    if (isKvass || SINGLE_COLOR_DESCRIPTOR_RE.test(rest)) {
      return rest;
    }
  }
  return value;
}

function cleanBeerName(
  rawTitle: string,
  brewery: string,
  brandFromTail: boolean,
  isKvass: boolean,
): string {
  let name = rawTitle.replace(STRIP_CATEGORY_PREFIX_RE, '').trim();
  const tailMatch = name.match(TAIL_START_RE);
  if (tailMatch && tailMatch.index !== undefined) {
    name = name.slice(0, tailMatch.index).trim();
  }

  name = name.replace(ABV_CLEAN_RE, ' ').replace(/\s+/g, ' ').trim();
  while (LEADING_DESCRIPTOR_RE.test(name)) {
    name = name.replace(LEADING_DESCRIPTOR_RE, '').trim();
  }
  name = name.replace(TRAILING_NA_DESCRIPTOR_RE, '').trim();

  name = name
    .replace(/(?<=\p{L})"(?=\p{L})/gu, "'")
    .replace(/["«»„“”]/gu, '')
    .replace(/\.+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  name = stripLeadingBrandWhenRedundant(name, brewery, isKvass);

  if (SINGLE_COLOR_DESCRIPTOR_RE.test(name) && brandFromTail && brewery) {
    name = brewery;
  }

  if (isKvass) {
    name = name.replace(KVASS_LIVE_FERMENTATION_RE, '').replace(/\s+/g, ' ').trim();
    if (name && /\p{Script=Cyrillic}/u.test(name) && !/^квас(?![\p{L}\p{N}])/iu.test(name)) {
      name = `Квас ${name}`;
    }
  }

  return name;
}

function finalizeGenericName(name: string, isAlcoholFree: boolean): string {
  let finalName = name;

  // Client normalizeKey() strips Cyrillic; keep a letter-only Latin transliteration in
  // parentheses so Cyrillic-only names never collide in cache while server stripSearchNoise() drops it.
  if (finalName && /\p{Script=Cyrillic}/u.test(finalName) && !/[a-z]/i.test(finalName)) {
    const latin = transliterateCyrillic(finalName);
    if (latin && /[a-z]/i.test(latin)) {
      finalName = `${finalName} (${latin})`;
    }
  }

  if (isAlcoholFree && finalName && !/\b0[.,]0\s*%?/u.test(finalName)) {
    finalName = `${finalName} 0.0%`;
  }

  return finalName;
}

function resolveGenericIdentity(
  el: HTMLElement,
  rawTitle: string,
  abv: number | undefined,
): { brewery: string; name: string } {
  const rawBrand = text(el.querySelector('.manufacturer a') ?? el.querySelector('.manufacturer'));
  const brandMissing = !rawBrand || MARCAS_VARIADAS_RE.test(rawBrand);
  const tailBrewery = brandMissing ? extractTailBrewery(rawTitle) : '';
  const parsedBrewery = brandMissing ? tailBrewery : rawBrand;
  const isKvass = KVASS_TITLE_PREFIX_RE.test(rawTitle);
  const isAlcoholFree = abv === 0 || NA_DESCRIPTOR_RE.test(rawTitle);
  const cleanedName = cleanBeerName(rawTitle, parsedBrewery, Boolean(tailBrewery), isKvass);
  const canonicalBrewery = CANONICAL_BREWERIES[parsedBrewery.toLocaleLowerCase('uk-UA')] ?? parsedBrewery;
  if (!cleanedName) return { brewery: canonicalBrewery, name: '' };

  let brewery = canonicalBrewery;
  let name = cleanedName;
  const rawLower = parsedBrewery.toLocaleLowerCase('uk-UA');

  if (rawLower === 'kozel') {
    if (/^(?:kozel\s+)?(?:чорне|черное|negro|ciemne|neagr[aă])$/iu.test(cleanedName)) {
      brewery = 'Pivovar Velké Popovice';
      name = 'Kozel Černý / Dark';
    } else if (/^(?:kozel\s+)?(?:світле|светлое|claro|clara|jasne|blond[aă])$/iu.test(cleanedName)) {
      brewery = 'Pivovar Velké Popovice';
      name = 'Kozel Premium Lager / Kozel 11';
    }
  } else if (rawLower === 'lvivske' && /^(?:(?:lvivske|львівське)\s+)?(?:світле|светлое|svitle|svitlo|clara|claro|jasne|blond[aă])$/iu.test(cleanedName)) {
    brewery = 'Carlsberg Ukraine';
    name = 'Lvivske Blonde';
  } else if (rawLower === 'tyskie' && /^browary\s+ksiazece$/iu.test(cleanedName)) {
    brewery = 'Tyskie Browary Książęce';
    name = 'Tyskie Gronie';
  } else if (rawLower === 'zywiec' && /^namyslow$/iu.test(cleanedName)) {
    brewery = 'Browar Namysłów';
    name = 'Namysłów Pils';
  }

  return {
    brewery,
    name: finalizeGenericName(name, isAlcoholFree),
  };
}

export const extramagazin: SiteAdapter = {
  id: 'extramagazin',
  hostMatch: (url) => url.hostname === 'extramagazin.es' || url.hostname.endsWith('.extramagazin.es'),
  reRenderContainerSelector: CONTAINER_SELECTOR,

  isNonBeerPage(url) {
    const withoutLang = url.pathname.replace(LANG_PREFIX_RE, '');
    const normalized = withoutLang.replace(/\/+$/, '');
    return NON_BEER_PAGE_RE.test(normalized) || NON_BEER_HREF_RE.test(normalized);
  },

  parseCards(root) {
    const jsonLdTitles = itemListTitles(root);
    const cards: Card[] = [];

    for (const el of Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR))) {
      const linkEl =
        el.querySelector<HTMLAnchorElement>('a.product_name') ??
        el.querySelector<HTMLAnchorElement>('.product_desc h3 a');
      const href =
        linkEl?.getAttribute('href') ??
        el.querySelector<HTMLAnchorElement>('a.thumbnail')?.getAttribute('href') ??
        '';
      const rawTitle = resolveRawTitle(el, linkEl, href, jsonLdTitles);
      if (!rawTitle) continue;

      if (isNonBeerName(rawTitle) || NON_BEER_HREF_RE.test(href)) {
        cards.push({ el, brewery: '', name: '', nonBeer: true });
        continue;
      }

      const isEligible = BEVERAGE_HREF_RE.test(href) || BEVERAGE_TITLE_PREFIX_RE.test(rawTitle);
      if (!isEligible) continue;

      const abv = parseAbv(rawTitle);
      const override = NORMALIZED_SLUG_OVERRIDES[productKey(href)];
      const { brewery, name } = override ?? resolveGenericIdentity(el, rawTitle, abv);
      if (!name) {
        cards.push({ el, brewery, name: rawTitle, skip: true, skipReason: 'unparsed' });
        continue;
      }

      if (isNonAlcoholicSoftDrinkFamily({ name: `${brewery} ${name}`.trim(), abv })) {
        cards.push({ el, brewery: '', name: '', nonBeer: true });
        continue;
      }

      cards.push(abv === undefined ? { el, brewery, name } : { el, brewery, name, abv });
    }

    return cards;
  },
};
