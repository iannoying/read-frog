export interface LibreInput { text: string, from: string, to: string, endpoint: string, apiKey?: string }
export interface LibreOutput { text: string }

export async function translateLibre(input: LibreInput): Promise<LibreOutput> {
  const body: Record<string, string> = { q: input.text, source: input.from, target: input.to, format: "text" }
  if (input.apiKey)
    body.api_key = input.apiKey
  const res = await fetch(input.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok)
    throw new Error(`LibreTranslate HTTP ${res.status}`)
  const data = await res.json() as { translatedText?: string, error?: string }
  if (data.error)
    throw new Error(`LibreTranslate: ${data.error}`)
  return { text: data.translatedText ?? "" }
}
