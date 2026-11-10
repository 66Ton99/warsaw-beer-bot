import type { MatchResult, RawBeer } from '../api/types';
import { getCardMatch, saveCardMatch, getUserHadByBid, findUserHadByName, getAllUserHad, findCatalogBeer, type UserHadBeer } from '../db/indexed-db';
import { searchUntappdBeer } from './search';
import { getAuthState } from './auth';

export function makeCardKey(card: RawBeer): string {
  const b = (card.brewery || '').toLowerCase().trim();
  const n = (card.name || '').toLowerCase().trim();
  const a = card.abv !== undefined ? card.abv : '';
  const bid = card.bid !== undefined ? card.bid : '';
  return `${b}::${n}::${a}::${bid}`;
}

export function normalizeBrewery(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(brouwerij|brasserie|brauerei|browar|cerveceria|cerveses|cervezas|brewery|brewing company|brewing co|brewing|beer company|craft brewery)\b/gi, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeBeerTokens(s: string): Set<string> {
  const norm = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(witbier|wit|blanche|white)\b/g, 'blanc')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return new Set(norm.split(/\s+/).filter((w) => w.length > 0));
}

export function findUserHadFuzzy(
  allHad: UserHadBeer[],
  cardBrewery: string,
  cardName: string,
): UserHadBeer | null {
  const b1 = normalizeBrewery(cardBrewery);
  if (!b1) return null;
  const t1 = normalizeBeerTokens(cardName);
  if (t1.size === 0) return null;

  for (const had of allHad) {
    const b2 = normalizeBrewery(had.brewery);
    if (b1 !== b2 && !b1.includes(b2) && !b2.includes(b1)) {
      continue;
    }
    const t2 = normalizeBeerTokens(had.name);

    // Remove brewery name tokens if present in beer tokens
    const bTokens = new Set([...b1.split(/\s+/), ...b2.split(/\s+/)]);
    for (const bt of bTokens) {
      if (t1.size > 1) t1.delete(bt);
      if (t2.size > 1) t2.delete(bt);
    }

    let matches = 0;
    for (const token of t1) {
      if (t2.has(token)) matches++;
    }
    if (matches > 0 && matches >= Math.min(t1.size, t2.size)) {
      return had;
    }
  }
  return null;
}

export async function matchLocalCards(cards: RawBeer[]): Promise<MatchResult[]> {
  const auth = await getAuthState();
  const results: MatchResult[] = [];
  let allHadCache: UserHadBeer[] | null = null;

  for (const card of cards) {
    const cardKey = makeCardKey(card);

    // 1. Try local cache in IndexedDB
    const cached = await getCardMatch(cardKey);
    if (cached) {
      // Re-verify personal drank status with user's local history if user is logged in
      if (auth.isLoggedIn && cached.matched_beer?.untappd_id) {
        const had = await getUserHadByBid(cached.matched_beer.untappd_id);
        if (had) {
          cached.is_drunk = true;
          cached.user_rating = had.rating;
        }
      }
      results.push(cached);
      continue;
    }

    // 2. Resolve identity from local DB first
    let matchedId: number | null = null;
    let matchedName = card.name;
    let matchedBrewery = card.brewery;
    let globalRating: number | null = null;
    let isDrunk = false;
    let userRating: number | null = null;

    // Check by published BID
    if (card.bid) {
      matchedId = card.bid;
      const had = await getUserHadByBid(card.bid);
      if (had) {
        isDrunk = true;
        userRating = had.rating;
        matchedName = had.name;
        matchedBrewery = had.brewery;
      }
    }

    // If not found yet, check user_had by exact normalized name
    if (!matchedId) {
      const had = await findUserHadByName(card.brewery, card.name);
      if (had) {
        matchedId = had.bid;
        isDrunk = true;
        userRating = had.rating;
        matchedName = had.name;
        matchedBrewery = had.brewery;
      }
    }

    // If not found by exact name, try fuzzy match on user's drank beers
    if (!matchedId && auth.isLoggedIn) {
      if (!allHadCache) allHadCache = await getAllUserHad();
      const had = findUserHadFuzzy(allHadCache, card.brewery, card.name);
      if (had) {
        matchedId = had.bid;
        isDrunk = true;
        userRating = had.rating;
        matchedName = had.name;
        matchedBrewery = had.brewery;
      }
    }

    // If not in user_had, check local catalog
    if (!matchedId) {
      const inCat = await findCatalogBeer(card.brewery, card.name);
      if (inCat) {
        matchedId = inCat.bid;
        matchedName = inCat.name;
        matchedBrewery = inCat.brewery;
        globalRating = inCat.ratingGlobal;
      }
    }

    // 3. If still unknown, query Untappd search
    if (!matchedId) {
      const searched = await searchUntappdBeer(card.brewery, card.name);
      if (searched) {
        matchedId = searched.bid;
        matchedName = searched.beerName;
        matchedBrewery = searched.breweryName;
        globalRating = searched.ratingGlobal;

        // Check if user had this newly discovered beer
        const had = await getUserHadByBid(searched.bid);
        if (had) {
          isDrunk = true;
          userRating = had.rating;
        }
      }
    }

    const matchRes: MatchResult = {
      raw: { brewery: card.brewery, name: card.name },
      matched_beer: matchedId
        ? {
            id: matchedId,
            untappd_id: matchedId,
            name: matchedName,
            brewery: matchedBrewery,
            rating_global: globalRating,
          }
        : null,
      is_drunk: isDrunk,
      drunk_uncertain: false,
      user_rating: userRating,
      source: matchedId ? 'exact' : null,
      searched: true,
    };

    // Save in local match cache in IndexedDB
    await saveCardMatch(cardKey, matchRes);
    results.push(matchRes);
  }

  return results;
}
