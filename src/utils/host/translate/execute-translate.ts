import type { PromptResolver } from "./api/ai"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { ISO6393_TO_6391, LANG_CODE_TO_EN_NAME } from "@read-frog/definitions"
import { isLLMProviderConfig, isNonAPIProvider, isPureAPIProvider } from "@/types/config/provider"
import { aiTranslate } from "./api/ai"
import { translateBing } from "./api/bing"
import { deeplTranslate } from "./api/deepl"
import { deeplxTranslate } from "./api/deeplx"
import { googleTranslate } from "./api/google"
import { translateLibre } from "./api/libre"
import { microsoftTranslate } from "./api/microsoft"
import { translateYandex } from "./api/yandex"
import { prepareTranslationText } from "./text-preparation"

export async function executeTranslate<TContext>(
  text: string,
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    forceBackgroundFetch?: boolean
    isBatch?: boolean
    context?: TContext
  },
) {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const { provider } = providerConfig
  let translatedText = ""

  if (isNonAPIProvider(provider)) {
    const sourceLang = langConfig.sourceCode === "auto" ? "auto" : (ISO6393_TO_6391[langConfig.sourceCode] ?? "auto")
    const targetLang = ISO6393_TO_6391[langConfig.targetCode]
    if (!targetLang) {
      throw new Error(`Invalid target language code: ${langConfig.targetCode}`)
    }
    if (provider === "google-translate") {
      translatedText = await googleTranslate(preparedText, sourceLang, targetLang)
    }
    else if (provider === "microsoft-translate") {
      translatedText = await microsoftTranslate(preparedText, sourceLang, targetLang)
    }
    else if (provider === "bing-translate") {
      const result = await translateBing({ text: preparedText, from: sourceLang, to: targetLang })
      translatedText = result.text
    }
    else if (provider === "yandex-translate") {
      const result = await translateYandex({ text: preparedText, from: sourceLang, to: targetLang })
      translatedText = result.text
    }
  }
  else if (isPureAPIProvider(provider)) {
    const sourceLang = langConfig.sourceCode === "auto" ? "auto" : (ISO6393_TO_6391[langConfig.sourceCode] ?? "auto")
    const targetLang = ISO6393_TO_6391[langConfig.targetCode]
    if (!targetLang) {
      throw new Error(`Invalid target language code: ${langConfig.targetCode}`)
    }
    if (provider === "deeplx") {
      translatedText = await deeplxTranslate(preparedText, sourceLang, targetLang, providerConfig, options)
    }
    else if (provider === "deepl") {
      translatedText = await deeplTranslate(text, sourceLang, targetLang, providerConfig, options)
    }
    else if (provider === "libre-translate") {
      const libreConfig = providerConfig as Extract<ProviderConfig, { provider: "libre-translate" }>
      const result = await translateLibre({
        text: preparedText,
        from: sourceLang,
        to: targetLang,
        endpoint: libreConfig.endpoint,
        apiKey: libreConfig.apiKey,
      })
      translatedText = result.text
    }
  }
  else if (isLLMProviderConfig(providerConfig)) {
    const targetLangName = LANG_CODE_TO_EN_NAME[langConfig.targetCode]
    translatedText = await aiTranslate(preparedText, targetLangName, providerConfig, promptResolver, options)
  }
  else {
    throw new Error(`Unknown provider: ${provider}`)
  }

  return translatedText.trim()
}
