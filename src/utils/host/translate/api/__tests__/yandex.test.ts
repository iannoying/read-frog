import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetSidCacheForTesting, translateYandex } from "../yandex"

const fetchMock = vi.fn()

describe("translateYandex", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    resetSidCacheForTesting()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("fetches SID and returns translated text on happy path", async () => {
    // First call: fetch SID page
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(`<html>SID: 'abc.def.ghi'</html>`),
    })
    // Second call: translate endpoint
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 200, text: ["Привет"] }),
    })

    const result = await translateYandex({ text: "Hello", from: "en", to: "ru" })

    expect(result).toEqual({ text: "Привет" })

    // Verify SID was reversed: 'abc.def.ghi' → 'ghi.def.abc'
    const translateCall = fetchMock.mock.calls[1]
    expect(translateCall[0]).toContain("id=ghi.def.abc-0-0")
    expect(translateCall[0]).toContain("lang=en-ru")
  })

  it("throws with code in message when Yandex returns non-200 code in payload", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(`SID: 'x.y.z'`),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 401, message: "Unauthorized" }),
    })

    await expect(
      translateYandex({ text: "Hi", from: "en", to: "ru" }),
    ).rejects.toThrow("Yandex translate error 401: Unauthorized")
  })

  it("throws clearly when SID is missing from the page", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue("<html>no sid here</html>"),
    })

    await expect(
      translateYandex({ text: "Hi", from: "en", to: "ru" }),
    ).rejects.toThrow("Yandex SID not found")
  })

  it("reuses cached SID within TTL without re-fetching the page", async () => {
    // First translate: fetches SID + translates
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(`SID: 'a.b.c'`),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 200, text: ["one"] }),
    })

    await translateYandex({ text: "one", from: "en", to: "ru" })

    // Second translate: should reuse cache, only 1 more fetch call (translate only)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ code: 200, text: ["two"] }),
    })

    await translateYandex({ text: "two", from: "en", to: "ru" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
