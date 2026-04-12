// BoardGameGeek XML API client
// Free API, no auth required. Be respectful with rate limiting.
// https://boardgamegeek.com/wiki/page/BGG_XML_API2

let lastBGGRequestTime = 0;

async function rateLimitedBGGFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastBGGRequestTime;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastBGGRequestTime = Date.now();
  return fetch(url, {
    headers: { "User-Agent": "AfterroarStoreOps/1.0" },
  });
}

export interface BGGGame {
  id: string;
  name: string;
  yearPublished: string;
  image: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  playingTime: number;
  rating: number;
  categories: string[];
}

/**
 * Extract text content between XML tags.
 * Simple regex approach — avoids needing an XML library.
 */
function xmlText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXMLEntities(match[1].trim()) : "";
}

/**
 * Decode common XML entities.
 */
function decodeXMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#xa;/gi, "\n");
}

/**
 * Search BGG for board games by name.
 * Returns an array of {id, name} matches (up to 10).
 */
export async function searchBGG(
  query: string
): Promise<{ id: string; name: string }[]> {
  try {
    const url = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame&exact=0`;
    const res = await rateLimitedBGGFetch(url);

    if (!res.ok) {
      return [];
    }

    const xml = await res.text();

    const results: { id: string; name: string }[] = [];
    const itemRegex = /<item\s+type="boardgame"\s+id="(\d+)"[^>]*>[\s\S]*?<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && results.length < 10) {
      const id = match[1];
      const itemXml = match[0];
      // Get the primary name
      const nameMatch = itemXml.match(new RegExp('<name\\s+type="primary"\\s+value="([^"]*)"[^/]*/>', ""));
      const name = nameMatch ? decodeXMLEntities(nameMatch[1]) : "";
      if (id && name) {
        results.push({ id, name });
      }
    }

    return results;
  } catch (err) {
    console.error("BGG search failed:", err);
    return [];
  }
}

/**
 * Get detailed game info from BGG by ID.
 */
export async function getBGGGame(id: string): Promise<BGGGame | null> {
  try {
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${encodeURIComponent(id)}&stats=1`;
    const res = await rateLimitedBGGFetch(url);

    if (!res.ok) {
      return null;
    }

    const xml = await res.text();

    // Extract item block
    const itemMatch = xml.match(/<item\s[^>]*>[\s\S]*<\/item>/);
    if (!itemMatch) return null;
    const itemXml = itemMatch[0];

    // Primary name
    const nameMatch = itemXml.match(new RegExp('<name\\s+type="primary"\\s+value="([^"]*)"[^/]*\\/>'));
    const name = nameMatch ? decodeXMLEntities(nameMatch[1]) : "";

    // Year
    const yearMatch = itemXml.match(new RegExp('<yearpublished\\s+value="([^"]*)"[^/]*\\/>'));
    const yearPublished = yearMatch ? yearMatch[1] : "";

    // Image
    const image = xmlText(itemXml, "image");

    // Description
    const description = xmlText(itemXml, "description").slice(0, 500);

    // Players
    const minPlayersMatch = itemXml.match(new RegExp('<minplayers\\s+value="([^"]*)"[^/]*\\/>'));
    const maxPlayersMatch = itemXml.match(new RegExp('<maxplayers\\s+value="([^"]*)"[^/]*\\/>'));
    const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : 0;
    const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : 0;

    // Playtime
    const playtimeMatch = itemXml.match(new RegExp('<playingtime\\s+value="([^"]*)"[^/]*\\/>'));
    const playingTime = playtimeMatch ? parseInt(playtimeMatch[1], 10) : 0;

    // Rating (average)
    const ratingMatch = itemXml.match(new RegExp('<average\\s+value="([^"]*)"[^/]*\\/>'));
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    // Categories
    const categories: string[] = [];
    const catRegex = new RegExp('<link\\s+type="boardgamecategory"[^>]*value="([^"]*)"[^/]*\\/>', "g");
    let catMatch: RegExpExecArray | null;
    while ((catMatch = catRegex.exec(itemXml)) !== null) {
      categories.push(decodeXMLEntities(catMatch[1]));
    }

    return {
      id,
      name,
      yearPublished,
      image,
      description,
      minPlayers,
      maxPlayers,
      playingTime,
      rating: Math.round(rating * 10) / 10,
      categories,
    };
  } catch (err) {
    console.error("BGG game fetch failed:", err);
    return null;
  }
}
