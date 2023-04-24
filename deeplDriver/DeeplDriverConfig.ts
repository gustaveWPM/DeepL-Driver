const USING_DEEPL_FREE: boolean = true;

const FREE_DEEPL_API_MAX_DATA_CHUNK_SIZE: number = 1000;
const PRO_DEEPL_API_MAX_DATA_CHUNK_SIZE: number = 5000;
const FREE_DEEPL_API_ROUTE_BASE: string = "https://api-free.deepl.com/v2/translate";
const PRO_DEEPL_API_ROUTE_BASE: string = "https://api.deepl.com/v2/translate";

export const DEEPL_API_MAX_DATA_CHUNK_SIZE: number = USING_DEEPL_FREE
  ? FREE_DEEPL_API_MAX_DATA_CHUNK_SIZE
  : PRO_DEEPL_API_MAX_DATA_CHUNK_SIZE;
export const DEEPL_API_ROUTE_BASE: string = USING_DEEPL_FREE
  ? FREE_DEEPL_API_ROUTE_BASE
  : PRO_DEEPL_API_ROUTE_BASE;

export const CORS_PROXY_MAX_RETRY: number = 5;
export const RETRY_DELAY: number = 500;
export const CORS_PROXY_PREFIX_FOR_RESCUE_CTX: string = "https://proxy.cors.sh/";

export const DEEPL_API_SECRET_AUTH_KEY: string | undefined = undefined;
export const CORS_SH_API_SECRET_AUTH_KEY: string | undefined = undefined;

enum AvailableLanguagesSymbols {
  "bg",
  "cs",
  "da",
  "de",
  "el",
  "en-gb",
  "en-us",
  "es",
  "et",
  "fi",
  "fr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "lt",
  "lv",
  "nb",
  "nl",
  "pl",
  "pt-br",
  "pt-pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "tr",
  "uk",
  "zh"
}

export type DeeplLanguageSymbol = keyof typeof AvailableLanguagesSymbols;
