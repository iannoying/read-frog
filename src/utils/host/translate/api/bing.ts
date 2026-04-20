export interface BingInput { text: string, from: string, to: string }
export interface BingOutput { text: string }

interface TokenCache {
  ig: string
  iid: string
  key: string
  token: string
  fetchedAt: number
}

const TOKEN_TTL = 30 * 60_000

let _tokenCache: TokenCache | null = null

export function resetTokenCacheForTesting(): void {
  _tokenCache = null
}

async function fetchToken(): Promise<TokenCache> {
  if (_tokenCache && Date.now() - _tokenCache.fetchedAt < TOKEN_TTL)
    return _tokenCache

  const res = await fetch("https://www.bing.com/translator")
  const html = await res.text()
  const ig = html.match(/IG:"([^"]+)"/)?.[1]
  const iid = html.match(/_G\.IID="([^"]+)"/)?.[1]
  const params = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)"/)

  if (!ig || !iid || !params)
    throw new Error("Bing translator IG/IID/key not found")

  _tokenCache = { ig, iid, key: params[1], token: params[2], fetchedAt: Date.now() }
  return _tokenCache
}

export async function translateBing(input: BingInput): Promise<BingOutput> {
  const t = await fetchToken()
  const url = `https://www.bing.com/ttranslatev3?isVertical=1&IG=${t.ig}&IID=${t.iid}`
  const body = new URLSearchParams({
    fromLang: input.from,
    to: input.to,
    text: input.text,
    key: t.key,
    token: t.token,
  })

  const res = await fetch(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  })

  if (!res.ok)
    throw new Error(`Bing translate HTTP ${res.status}`)

  const data = await res.json() as Array<{ translations: Array<{ text: string }> }>
  return { text: data?.[0]?.translations?.[0]?.text ?? "" }
}
