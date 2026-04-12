/* ------------------------------------------------------------------ */
/*  TCG Price Lookup Service                                            */
/*  Fetches market prices from free APIs:                               */
/*    - Scryfall (MTG) — prices.usd, prices.usd_foil                  */
/*    - pokemontcg.io (Pokemon) — tcgplayer.prices                     */
/*    - ygoprodeck.com (Yu-Gi-Oh) — card_prices                       */
/*                                                                      */
/*  Used in: trade-in wizard (market price reference),                  */
/*           inventory valuation, cash flow intelligence                */
/* ------------------------------------------------------------------ */

export interface PriceLookupResult {
  found: boolean;
  name: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string;
  image_url?: string;
  prices: {
    market_usd?: number;       // Cents
    market_usd_foil?: number;  // Cents
    low_usd?: number;
    high_usd?: number;
  };
  source: string;
  tcgplayer_id?: number;
  external_url?: string;
}

/** Delay between requests to respect rate limits */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function dollarsToCents(usd: string | null | undefined): number | undefined {
  if (!usd) return undefined;
  return Math.round(parseFloat(usd) * 100);
}

/* ------------------------------------------------------------------ */
/*  Scryfall (MTG)                                                      */
/* ------------------------------------------------------------------ */

export async function lookupMTGCard(
  cardName: string,
  options?: { set?: string; collector_number?: string }
): Promise<PriceLookupResult> {
  try {
    let url: string;

    if (options?.set && options?.collector_number) {
      url = `https://api.scryfall.com/cards/${encodeURIComponent(options.set)}/${encodeURIComponent(options.collector_number)}`;
    } else if (options?.set) {
      url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}&set=${encodeURIComponent(options.set)}`;
    } else {
      url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`;
    }

    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return { found: false, name: cardName, prices: {}, source: "scryfall" };
    }

    const card = await res.json();

    return {
      found: true,
      name: card.name,
      set_name: card.set_name,
      collector_number: card.collector_number,
      rarity: card.rarity,
      image_url: card.image_uris?.normal ?? card.image_uris?.small,
      prices: {
        market_usd: dollarsToCents(card.prices?.usd),
        market_usd_foil: dollarsToCents(card.prices?.usd_foil),
      },
      source: "scryfall",
      tcgplayer_id: card.tcgplayer_id,
      external_url: card.scryfall_uri,
    };
  } catch {
    return { found: false, name: cardName, prices: {}, source: "scryfall" };
  }
}

/* ------------------------------------------------------------------ */
/*  Pokemon TCG API (pokemontcg.io)                                     */
/* ------------------------------------------------------------------ */

export async function lookupPokemonCard(
  cardName: string
): Promise<PriceLookupResult> {
  try {
    const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(cardName)}"&pageSize=1&orderBy=-set.releaseDate`;

    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return { found: false, name: cardName, prices: {}, source: "pokemontcg" };
    }

    const data = await res.json();
    const card = data.data?.[0];

    if (!card) {
      return { found: false, name: cardName, prices: {}, source: "pokemontcg" };
    }

    const tcgPrices = card.tcgplayer?.prices;
    const normalPrices = tcgPrices?.normal ?? tcgPrices?.holofoil ?? tcgPrices?.reverseHolofoil ?? {};

    return {
      found: true,
      name: card.name,
      set_name: card.set?.name,
      collector_number: card.number,
      rarity: card.rarity,
      image_url: card.images?.small,
      prices: {
        market_usd: normalPrices.market ? Math.round(normalPrices.market * 100) : undefined,
        low_usd: normalPrices.low ? Math.round(normalPrices.low * 100) : undefined,
        high_usd: normalPrices.high ? Math.round(normalPrices.high * 100) : undefined,
      },
      source: "pokemontcg",
      external_url: `https://pokemontcg.io/card/${card.id}`,
    };
  } catch {
    return { found: false, name: cardName, prices: {}, source: "pokemontcg" };
  }
}

/* ------------------------------------------------------------------ */
/*  Yu-Gi-Oh (ygoprodeck.com)                                          */
/* ------------------------------------------------------------------ */

export async function lookupYuGiOhCard(
  cardName: string
): Promise<PriceLookupResult> {
  try {
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(cardName)}`;

    const res = await fetch(url);

    if (!res.ok) {
      return { found: false, name: cardName, prices: {}, source: "ygoprodeck" };
    }

    const data = await res.json();
    const card = data.data?.[0];

    if (!card) {
      return { found: false, name: cardName, prices: {}, source: "ygoprodeck" };
    }

    const prices = card.card_prices?.[0];

    return {
      found: true,
      name: card.name,
      rarity: card.card_sets?.[0]?.set_rarity,
      image_url: card.card_images?.[0]?.image_url_small,
      prices: {
        market_usd: prices?.tcgplayer_price ? Math.round(parseFloat(prices.tcgplayer_price) * 100) : undefined,
      },
      source: "ygoprodeck",
    };
  } catch {
    return { found: false, name: cardName, prices: {}, source: "ygoprodeck" };
  }
}

/* ------------------------------------------------------------------ */
/*  Universal lookup — detects game and routes to the right API         */
/* ------------------------------------------------------------------ */

export async function lookupCardPrice(
  cardName: string,
  game?: string,
  options?: { set?: string; collector_number?: string }
): Promise<PriceLookupResult> {
  const g = (game ?? "mtg").toLowerCase();

  switch (g) {
    case "mtg":
    case "magic":
    case "magic: the gathering":
      return lookupMTGCard(cardName, options);

    case "pokemon":
    case "pokémon":
      return lookupPokemonCard(cardName);

    case "yugioh":
    case "yu-gi-oh":
    case "yu-gi-oh!":
      return lookupYuGiOhCard(cardName);

    default:
      // Try Scryfall first (MTG is most common in FLGS)
      const mtgResult = await lookupMTGCard(cardName, options);
      if (mtgResult.found) return mtgResult;

      // Then Pokemon
      await delay(100);
      const pokemonResult = await lookupPokemonCard(cardName);
      if (pokemonResult.found) return pokemonResult;

      // Then Yu-Gi-Oh
      await delay(100);
      return lookupYuGiOhCard(cardName);
  }
}
