export interface YandexInput { text: string, from: string, to: string }
export interface YandexOutput { text: string }

interface SidCache { sid: string, fetchedAt: number }

let sidCache: SidCache | null = null
const TTL = 30 * 60_000

export function resetSidCacheForTesting(): void {
  sidCache = null
}

async function fetchSid(): Promise<string> {
  if (sidCache && Date.now() - sidCache.fetchedAt < TTL)
    return sidCache.sid
  const res = await fetch("https://translate.yandex.com/")
  const html = await res.text()
  const m = html.match(/SID:\s*['"]([^'"]+)['"]/)
  if (!m)
    throw new Error("Yandex SID not found")
  const sid = m[1].split(".").reverse().join(".")
  sidCache = { sid, fetchedAt: Date.now() }
  return sid
}

export async function translateYandex(input: YandexInput): Promise<YandexOutput> {
  const sid = await fetchSid()
  const url = `https://translate.yandex.net/api/v1/tr.json/translate?srv=tr-text&id=${sid}-0-0&lang=${input.from}-${input.to}`
  const body = new URLSearchParams({ text: input.text, options: "4" })
  const res = await fetch(url, { method: "POST", body })
  const data = await res.json() as { code: number, text?: string[], message?: string }
  if (data.code !== 200)
    throw new Error(`Yandex translate error ${data.code}: ${data.message ?? ""}`)
  return { text: data.text?.[0] ?? "" }
}
