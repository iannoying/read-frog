import type { ReactNode } from "react"
// @vitest-environment jsdom
import type { Entitlements } from "@/types/entitlements"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { createStore, Provider as JotaiProvider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"
import { useEntitlements } from "../use-entitlements"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const fetchMock = vi.fn()

vi.mock("@/utils/billing/fetch-entitlements", () => ({
  BillingNotImplementedError: class BillingNotImplementedError extends Error {
    constructor() {
      super("billing.getEntitlements not implemented yet on backend")
    }
  },
  fetchEntitlementsFromBackend: () => fetchMock(),
}))

const readCacheMock = vi.fn()
const writeCacheMock = vi.fn()

vi.mock("@/utils/db/dexie/entitlements", () => ({
  readCachedEntitlements: (...args: unknown[]) => readCacheMock(...args),
  writeCachedEntitlements: (...args: unknown[]) => writeCacheMock(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_ENTITLEMENTS: Entitlements = {
  tier: "pro",
  features: ["pdf_translate", "vocab_unlimited"],
  quota: { ai_translate_monthly: { used: 0, limit: 50000 } },
  expiresAt: "2099-01-01T00:00:00.000Z",
}

function renderWithProviders<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const store = createStore()

  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  )

  return renderHook(hook, { wrapper })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useEntitlements", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    readCacheMock.mockReset()
    writeCacheMock.mockReset()
    writeCacheMock.mockResolvedValue(undefined)
  })

  it("returns FREE when userId is null without firing a query", () => {
    const { result } = renderWithProviders(() => useEntitlements(null))
    expect(result.current).toEqual({
      data: FREE_ENTITLEMENTS,
      isLoading: false,
      isFromCache: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns Pro entitlements from backend on happy path", async () => {
    fetchMock.mockResolvedValue(PRO_ENTITLEMENTS)
    readCacheMock.mockResolvedValue(null)

    const { result } = renderWithProviders(() => useEntitlements("user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual(PRO_ENTITLEMENTS)
    expect(result.current.isFromCache).toBe(false)
    expect(writeCacheMock).toHaveBeenCalledWith("user-1", PRO_ENTITLEMENTS)
  })

  it("falls back to Dexie on backend error and sets isFromCache=true", async () => {
    fetchMock.mockRejectedValue(new Error("network error"))
    readCacheMock.mockResolvedValue({ userId: "user-1", value: PRO_ENTITLEMENTS, updatedAt: new Date() })

    const { result } = renderWithProviders(() => useEntitlements("user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual(PRO_ENTITLEMENTS)
    expect(result.current.isFromCache).toBe(true)
    expect(writeCacheMock).not.toHaveBeenCalled()
  })

  it("returns FREE when both backend and cache miss", async () => {
    fetchMock.mockRejectedValue(new Error("network error"))
    readCacheMock.mockResolvedValue(null)

    const { result } = renderWithProviders(() => useEntitlements("user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual(FREE_ENTITLEMENTS)
    expect(result.current.isFromCache).toBe(false)
  })

  it("re-queries when userId changes", async () => {
    fetchMock.mockResolvedValue(PRO_ENTITLEMENTS)
    readCacheMock.mockResolvedValue(null)

    let userId = "user-1"
    const { result, rerender } = renderWithProviders(() => useEntitlements(userId))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(PRO_ENTITLEMENTS)

    const secondUserEntitlements: Entitlements = { ...FREE_ENTITLEMENTS }
    fetchMock.mockResolvedValue(secondUserEntitlements)
    userId = "user-2"
    rerender()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(secondUserEntitlements)
  })

  it("falls back to cache when backend returns malformed data (schema parse fails)", async () => {
    // Return an object that will fail EntitlementsSchema.parse
    fetchMock.mockResolvedValue({ tier: "unknown-tier", features: "not-an-array" } as unknown as Entitlements)
    readCacheMock.mockResolvedValue({ userId: "user-1", value: PRO_ENTITLEMENTS, updatedAt: new Date() })

    const { result } = renderWithProviders(() => useEntitlements("user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Schema parse error → cache fallback
    expect(result.current.data).toEqual(PRO_ENTITLEMENTS)
    expect(result.current.isFromCache).toBe(true)
  })
})
