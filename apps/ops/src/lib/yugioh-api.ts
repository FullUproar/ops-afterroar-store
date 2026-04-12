/* ------------------------------------------------------------------ */
/*  Yu-Gi-Oh API Client (YGOPRODeck)                                   */
/*  API docs: https://ygoprodeck.com/api-guide/                        */
/*  Free, no key required                                              */
/* ------------------------------------------------------------------ */

export interface YuGiOhCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  card_sets?: Array<{
    set_name: string;
    set_code: string;
    set_rarity: string;
    set_rarity_code: string;
    set_price: string;
  }>;
  card_images: Array<{
    id: number;
    image_url: string;
    image_url_small: string;
    image_url_cropped: string;
  }>;
  card_prices: Array<{
    cardmarket_price: string;
    tcgplayer_price: string;
    ebay_price: string;
    amazon_price: string;
    coolstuffinc_price: string;
  }>;
}

export interface CatalogYuGiOhCard {
  yugioh_id: number;
  name: string;
  type: string;
  race: string;
  image_url: string | null;
  small_image_url: string | null;
  price_tcgplayer: number | null; // cents
  price_cardmarket: number | null;
  set_name: string | null;
  set_code: string | null;
  rarity: string | null;
}

function dollarsToCents(str: string | undefined): number | null {
  if (!str) return null;
  const n = parseFloat(str);
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100);
}

export function yugiohToCatalogCard(card: YuGiOhCard): CatalogYuGiOhCard {
  const prices = card.card_prices?.[0];
  const firstSet = card.card_sets?.[0];

  return {
    yugioh_id: card.id,
    name: card.name,
    type: card.type,
    race: card.race,
    image_url: card.card_images?.[0]?.image_url ?? null,
    small_image_url: card.card_images?.[0]?.image_url_small ?? null,
    price_tcgplayer: dollarsToCents(prices?.tcgplayer_price),
    price_cardmarket: dollarsToCents(prices?.cardmarket_price),
    set_name: firstSet?.set_name ?? null,
    set_code: firstSet?.set_code ?? null,
    rarity: firstSet?.set_rarity ?? null,
  };
}

export async function searchYuGiOhCards(query: string): Promise<YuGiOhCard[]> {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}&num=20&offset=0`;

  const res = await fetch(url, { next: { revalidate: 300 } });

  if (!res.ok) {
    // YGOPRODeck returns 400 for "no results found"
    return [];
  }

  const data = await res.json();
  return (data.data ?? []) as YuGiOhCard[];
}
