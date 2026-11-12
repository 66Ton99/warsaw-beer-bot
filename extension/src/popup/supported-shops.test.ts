import { describe, expect, it, vi } from 'vitest';
import { ADAPTERS } from '../sites/registry';
import {
  browserLanguages,
  openShopTab,
  renderSupportedShops,
  supportedShopGroups,
} from './supported-shops';

describe('browserLanguages', () => {
  it('falls back to the primary language when the language list is unavailable', () => {
    expect(browserLanguages({ language: 'uk-UA' })).toEqual(['uk-UA']);
  });
});

describe('supportedShopGroups', () => {
  it('groups every supported adapter once by the country orders ship from', () => {
    const groups = supportedShopGroups(['en-GB']);

    expect(groups.map(({ country, shops }) => [country, shops.map(({ name }) => name)])).toEqual([
      ['Ukraine', ['BeerFreak', 'WineTime', 'Flasker']],
      ['Poland', ['OneMoreBeer', 'Piwne Mosty', 'Funkyshop']],
      ['The Netherlands', ['Beer Republic', 'Bierloods22', 'Hoptimaal']],
      ['Czechia', ['Beershop']],
    ]);
    expect(groups.flatMap(({ shops }) => shops.map(({ id }) => id)).sort())
      .toEqual(ADAPTERS.map(({ id }) => id).sort());
  });

  it('uses the Polish Beershop storefront when Polish is the preferred supported language', () => {
    const groups = supportedShopGroups(['de-DE', 'pl-PL', 'en-US']);
    const beershop = groups.flatMap(({ shops }) => shops).find(({ id }) => id === 'beershop');

    expect(beershop?.url).toBe('https://beershop.pl/');
  });

  it('uses the English Beershop storefront for Ukrainian and English users', () => {
    for (const languages of [['uk-UA'], ['en-GB'], ['de-DE']]) {
      const groups = supportedShopGroups(languages);
      const beershop = groups.flatMap(({ shops }) => shops).find(({ id }) => id === 'beershop');

      expect(beershop?.url).toBe('https://beershop.eu/');
    }
  });
});

describe('renderSupportedShops', () => {
  it('renders country headings, prevents default navigation, and opens the selected shop from its link', () => {
    const container = document.createElement('div');
    const open = vi.fn();

    const count = renderSupportedShops(container, ['en-GB'], open);

    expect(Array.from(container.querySelectorAll('.shop-country')).map((el) => el.textContent)).toEqual([
      'Ukraine',
      'Poland',
      'The Netherlands',
      'Czechia',
    ]);
    expect(container.querySelectorAll<HTMLAnchorElement>('.shop-link')).toHaveLength(10);
    expect(count).toBe(10);
    const flasker = Array.from(container.querySelectorAll<HTMLAnchorElement>('.shop-link'))
      .find((link) => link.textContent?.includes('Flasker'))!;

    expect(flasker.getAttribute('aria-label')).toBe('Open Flasker in a new tab');
    const event = new MouseEvent('click', { cancelable: true });
    flasker.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://flasker.com.ua/');
  });

  it('uses openShopTab by default when open argument is omitted', () => {
    const create = vi.fn(async () => ({} as chrome.tabs.Tab));
    vi.stubGlobal('chrome', { tabs: { create } });
    try {
      const container = document.createElement('div');
      renderSupportedShops(container, ['en-GB']);
      const link = container.querySelector<HTMLAnchorElement>('.shop-link')!;

      const event = new MouseEvent('click', { cancelable: true });
      link.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({ active: true, url: link.href });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not prevent default or call custom opener on Ctrl/Cmd/Shift clicks, but intercepts Alt+click', () => {
    const container = document.createElement('div');
    const open = vi.fn();
    renderSupportedShops(container, ['en-GB'], open);
    const link = container.querySelector<HTMLAnchorElement>('.shop-link')!;

    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      const event = new MouseEvent('click', { ...modifier, cancelable: true });
      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(open).not.toHaveBeenCalled();
    }

    const altEvent = new MouseEvent('click', { altKey: true, cancelable: true });
    link.dispatchEvent(altEvent);
    expect(altEvent.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(link.href);
  });

  it('falls back to window.open when tabs.create rejects through the default opener', async () => {
    const create = vi.fn(async () => { throw new Error('tab create failed'); });
    vi.stubGlobal('chrome', { tabs: { create } });
    const originalOpen = window.open;
    const windowOpen = vi.fn();
    window.open = windowOpen;
    try {
      const container = document.createElement('div');
      renderSupportedShops(container, ['en-GB']);
      const link = container.querySelector<HTMLAnchorElement>('.shop-link')!;

      link.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(create).toHaveBeenCalledTimes(1);
      expect(windowOpen).toHaveBeenCalledTimes(1);
      expect(windowOpen).toHaveBeenCalledWith(link.href, '_blank', 'noopener');
    } finally {
      window.open = originalOpen;
      vi.unstubAllGlobals();
    }
  });
});

describe('openShopTab', () => {
  it('opens the chosen shop in a new active browser tab', async () => {
    const create = vi.fn(async () => ({} as chrome.tabs.Tab));

    await openShopTab('https://beerfreak.org/', { create });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ active: true, url: 'https://beerfreak.org/' });
  });
});

