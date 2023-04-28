import {
  CORS_PROXY_MAX_RETRY,
  CORS_PROXY_PREFIX_FOR_RESCUE_CTX,
  CORS_SH_API_SECRET_AUTH_KEY,
  DEEPL_API_MAX_DATA_CHUNK_SIZE,
  DEEPL_API_ROUTE_BASE,
  DEEPL_API_SECRET_AUTH_KEY,
  RETRY_DELAY,
  DeeplLanguageSymbol,
} from "./DeeplDriverConfig";

interface IDeeplResponseSchema {
  detected_source_language: string;
  text: string;
}

interface IDeeplTranslationOptions {
  deeplApiRouteBase?: string;
  deeplApiSecretAuthEnvKey?: string;
  corsShApiSecretAuthEnvKey?: string;
  corsProxyPrefix?: string;
  legacyCtx?: boolean;
  pushBodyDirectlyInUrl?: boolean;
  sourceLang?: DeeplLanguageSymbol;

  deeplSecretKey?: string;
  corsShSecretKey?: string;
}

type StringDictionnary = Record<string, string>;
type StringDictionnaryArray = Record<string, string>[];
type DeeplDriverInputType = string | string[] | StringDictionnary;
type TokenizedDeeplDriverInputType = string[][] | StringDictionnaryArray;

function mergeTokenizedDeeplDriverInput(
  tokenizedDeeplOutput: string[][],
  inputOriginalKeys: string[][]
): DeeplDriverInputType {
  function mergeTokenizedStringDictionnary(
    tokenizedDeeplOutput: string[][],
    originalTokenizedInputKeys: string[][]
  ): StringDictionnary {
    const mergedObj: StringDictionnary = {};
    for (let i: number = 0; tokenizedDeeplOutput[i]; i++) {
      for (let j: number = 0; tokenizedDeeplOutput[i][j]; j++) {
        const entry: StringDictionnary = {};
        entry[originalTokenizedInputKeys[i][j]] = tokenizedDeeplOutput[i][j];
        Object.assign(mergedObj, entry);
      }
    }
    return mergedObj;
  }

  function mergeTokenizedStringArray(
    tokenizedDeeplOutput: string[][]
  ): string[] {
    const mergedArray: string[] = [];
    tokenizedDeeplOutput.forEach((arr) => {
      arr.forEach((element) => {
        mergedArray.push(element);
      });
    });
    return mergedArray;
  }

  if (inputOriginalKeys.length === 0) {
    return mergeTokenizedStringArray(tokenizedDeeplOutput);
  }
  return mergeTokenizedStringDictionnary(
    tokenizedDeeplOutput,
    inputOriginalKeys
  );
}

function tryToValidateTextArgument(originalInput: DeeplDriverInputType) {
  function tooBigStringError(str: string, len: number): Error {
    const excess = len - DEEPL_API_MAX_DATA_CHUNK_SIZE;
    return new Error(
      `Too big string! The maximum length of a DeepL text request is: ${DEEPL_API_MAX_DATA_CHUNK_SIZE}\n` +
        `But you tried to send a string with a length of: ${len}. (There are ${excess} character${
          excess > 1 && "s"
        } in excess.)\nSend it properly as an array or an object to the DeepL Driver, without any string bigger than ${DEEPL_API_MAX_DATA_CHUNK_SIZE} characters.\n\n` +
        `Concerned string: "${str}"`
    );
  }

  function produceThrowIfTooBigString(str: string, len: number) {
    const tooBigString = len > DEEPL_API_MAX_DATA_CHUNK_SIZE;
    if (tooBigString) {
      throw tooBigStringError(str, len);
    }
  }

  if (typeof originalInput === "string") {
    produceThrowIfTooBigString(originalInput, originalInput.length);
  } else if (Array.isArray(originalInput)) {
    for (const curText of originalInput) {
      produceThrowIfTooBigString(curText, curText.length);
    }
  } else {
    for (const curText of Object.values(originalInput)) {
      produceThrowIfTooBigString(curText, curText.length);
    }
  }
  // * ... Successful input check, GG!
}

function tokenizeDeeplDriverInput(
  originalInput: DeeplDriverInputType
): TokenizedDeeplDriverInputType {
  function tokenizeStringDictionnary(
    originalInput: StringDictionnary
  ): StringDictionnaryArray {
    const appendStringObjChunkToPartitions = () => {
      const resetStringObjChunk = () => {
        currentPartitionChunk = {};
        currentPartitionChunkSize = 0;
      };

      partitions.push(currentPartitionChunk);
      resetStringObjChunk();
    };

    const partitions: StringDictionnaryArray = [];
    let currentPartitionChunk: StringDictionnary = {};
    let currentPartitionChunkSize = 0;

    for (const [key, value] of Object.entries(originalInput)) {
      const textLen = value.length;
      if (currentPartitionChunkSize + textLen > DEEPL_API_MAX_DATA_CHUNK_SIZE) {
        appendStringObjChunkToPartitions();
      }
      const entry: StringDictionnary = {};
      entry[key] = value;
      Object.assign(currentPartitionChunk, entry);
      currentPartitionChunkSize += textLen;
    }
    if (currentPartitionChunkSize !== 0) {
      appendStringObjChunkToPartitions();
    }

    return partitions;
  }

  function tokenizeArray(originalInput: string[]): string[][] {
    const appendStringArrayChunkToPartitions = () => {
      const resetStringArrayChunk = () => {
        currentPartitionChunk = [];
        currentPartitionChunkSize = 0;
      };
      partitions.push(currentPartitionChunk);
      resetStringArrayChunk();
    };

    const partitions: string[][] = [];
    let currentPartitionChunk: string[] = [];
    let currentPartitionChunkSize = 0;

    for (const token of originalInput) {
      const textLen = token.length;
      if (currentPartitionChunkSize + textLen > DEEPL_API_MAX_DATA_CHUNK_SIZE) {
        appendStringArrayChunkToPartitions();
      }
      currentPartitionChunk.push(token);
      currentPartitionChunkSize += textLen;
    }

    if (currentPartitionChunkSize !== 0) {
      appendStringArrayChunkToPartitions();
    }

    return partitions;
  }

  if (Array.isArray(originalInput)) {
    return tokenizeArray(originalInput);
  }
  if (typeof originalInput === "string") {
    return [[originalInput]];
  }
  return tokenizeStringDictionnary(originalInput);
}

function getTranslationsCollection(translations: IDeeplResponseSchema[]) {
  const translationCollection: string[] = [];
  translations.forEach((t) => translationCollection.push(t.text));
  return translationCollection;
}

async function tryToProcessFetch(
  deeplApiRoute: string,
  deeplApiSecretKey: string,
  request: RequestInit
) {
  function isErrorResponse(responseStatus: number): boolean {
    return responseStatus >= 400 && responseStatus <= 599;
  }

  const response = await fetch(deeplApiRoute, request);
  if (isErrorResponse(response.status)) {
    throw `DeepL server failed to handle the request, maybe your API Key is invalid or tapped to the max?\nAPI key: ${deeplApiSecretKey}`;
  }

  const { translations } = await response.json();
  if (translations.length === 1) {
    return [translations[0].text];
  }
  const translationsCollection = getTranslationsCollection(translations);
  return translationsCollection;
}

function buildRequest(headers: Headers, body: URLSearchParams): RequestInit {
  const request: RequestInit = {
    method: "POST",
    headers,
    body,
    redirect: "follow",
  };
  return request;
}

function tryToInitializeApiKey(
  configKey?: string,
  forcedValue?: string,
  useCase?: string
): string {
  function errorBuilder(useCase?: string) {
    const stringifiedUseCase = useCase ? `${useCase}: ` : "";
    const errorMsg = `${stringifiedUseCase}No API key provided in the DeeplDriver call, nor in the DeeplDriver config file`;
    return new Error(errorMsg);
  }

  if (forcedValue !== undefined) {
    return forcedValue;
  }

  if (configKey !== undefined) {
    return configKey;
  }
  throw errorBuilder(useCase);
}

function tryToRetrieveDeeplApiSecretKey(deeplSecretKey?: string): string {
  try {
    let deeplApiSecretKey: string = tryToInitializeApiKey(
      DEEPL_API_SECRET_AUTH_KEY,
      deeplSecretKey,
      "Deepl's API call"
    );
    return deeplApiSecretKey;
  } catch (error) {
    throw error;
  }
}

function tryToRetrieveCorsShApiSecretKey(
  legacyCtx: boolean,
  corsShSecretKey?: string
): string {
  if (legacyCtx) {
    return "";
  }
  try {
    let corsShApiSecretKey: string = tryToInitializeApiKey(
      CORS_SH_API_SECRET_AUTH_KEY,
      corsShSecretKey,
      "Cors.sh's API call"
    );
    return corsShApiSecretKey;
  } catch (error) {
    throw error;
  }
}
function buildHeaders(
  legacyCtx: boolean,
  deeplApiSecretKey: string,
  corsProxyPrefix?: string,
  corsShSecretKey?: string
): Headers {
  const headers: Headers = new Headers();
  headers.append("Content-Type", "application/x-www-form-urlencoded");

  try {
    const corsShApiSecretKey = tryToRetrieveCorsShApiSecretKey(
      legacyCtx,
      corsShSecretKey
    );
    if (corsProxyPrefix !== undefined && corsShApiSecretKey !== "") {
      headers.append("x-cors-api-key", corsShApiSecretKey);
    }
  } catch (error) {
    // * ... Failed to retrieve cors.sh API key
    if (!legacyCtx) {
      throw error;
    }
  }

  if (!legacyCtx) {
    headers.append("Authorization", `DeepL-Auth-Key ${deeplApiSecretKey}`);
  }
  return headers;
}

function doPushBodyDirectlyInUrl(
  headers: Headers,
  body: URLSearchParams,
  corsProxyPrefix: string
): string {
  let deeplApiRoute = DEEPL_API_ROUTE_BASE;
  if (!headers.get("x-cors-api-key")) {
    return deeplApiRoute;
  }
  deeplApiRoute = corsProxyPrefix + deeplApiRoute;
  let firstKey = true;
  for (const [key, value] of body) {
    deeplApiRoute += (firstKey ? "?" : "&") + key + "=" + encodeURI(value);
    firstKey = false;
  }
  body.delete("text");
  body.delete("source_lang");
  body.delete("target_lang");
  return deeplApiRoute;
}

function buildBodyAndDeeplApiRoute(
  currentTokenizedOriginalInputToken: DeeplDriverInputType,
  headers: Headers,
  legacyCtx: boolean,
  deeplApiSecretKey: string,
  target_lang: string,
  corsProxyPrefix?: string,
  pushBodyDirectlyInUrl?: boolean,
  sourceLang?: DeeplLanguageSymbol
): [URLSearchParams, string] {
  function appendBodyTextFromStringDictionnary(
    sDictionnary: StringDictionnary,
    body: URLSearchParams
  ) {
    Object.values(sDictionnary).forEach((t: string) => body.append("text", t));
  }

  function appendBodyTextFromStringArray(
    sArray: string[],
    body: URLSearchParams
  ) {
    sArray.forEach((t: string) => body.append("text", t));
  }

  function appendBodyText(
    currentTokenizedOriginalInputToken: DeeplDriverInputType,
    body: URLSearchParams
  ) {
    if (Array.isArray(currentTokenizedOriginalInputToken)) {
      appendBodyTextFromStringArray(currentTokenizedOriginalInputToken, body);
    } else {
      appendBodyTextFromStringDictionnary(
        currentTokenizedOriginalInputToken as StringDictionnary,
        body
      );
    }
  }

  const body: URLSearchParams = new URLSearchParams();
  if (legacyCtx) {
    body.append("auth_key", deeplApiSecretKey);
  }

  if (sourceLang) {
    body.append("source_lang", sourceLang.toUpperCase());
  }

  appendBodyText(currentTokenizedOriginalInputToken, body);
  body.append("target_lang", target_lang);

  let deeplApiRoute: string = "";
  if (pushBodyDirectlyInUrl && corsProxyPrefix) {
    deeplApiRoute = doPushBodyDirectlyInUrl(headers, body, corsProxyPrefix);
  } else {
    deeplApiRoute = DEEPL_API_ROUTE_BASE;
  }

  return [body, deeplApiRoute];
}

function getDefaultOptionsValues(
  corsProxyPrefix?: string
): IDeeplTranslationOptions {
  const legacyCtx: boolean = !corsProxyPrefix;
  const pushBodyDirectlyInUrl: boolean = !legacyCtx;

  return {
    deeplApiRouteBase: DEEPL_API_ROUTE_BASE,
    deeplApiSecretAuthEnvKey: DEEPL_API_SECRET_AUTH_KEY,
    corsShApiSecretAuthEnvKey: CORS_SH_API_SECRET_AUTH_KEY,
    corsProxyPrefix,
    legacyCtx,
    pushBodyDirectlyInUrl,
  };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryToProcessTokenizedOriginalInput(
  tokenizedOriginalInput: TokenizedDeeplDriverInputType,
  targetLangSymbol: DeeplLanguageSymbol,
  customOptions: IDeeplTranslationOptions = {}
): Promise<DeeplDriverInputType> {
  const craftedOptions: IDeeplTranslationOptions = getDefaultOptionsValues(
    customOptions.corsProxyPrefix
  );
  craftedOptions.sourceLang = customOptions.sourceLang;
  const target_lang = targetLangSymbol.toUpperCase();
  const inputOriginalKeys: string[][] = [];

  if (!Array.isArray(tokenizedOriginalInput[0])) {
    tokenizedOriginalInput.forEach((obj) =>
      inputOriginalKeys.push(Object.keys(obj))
    );
  }

  const tokenizedDeeplOutputs: string[][] = [];
  try {
    for (const currentTokenizedOriginalInputToken of tokenizedOriginalInput) {
      const legacyCtx = craftedOptions.legacyCtx as boolean;
      const deeplApiSecretKey = tryToRetrieveDeeplApiSecretKey(
        craftedOptions.deeplSecretKey
      );
      const headers = buildHeaders(
        legacyCtx,
        deeplApiSecretKey,
        craftedOptions.corsProxyPrefix,
        craftedOptions.corsShSecretKey
      );
      const [body, deeplApiRoute] = buildBodyAndDeeplApiRoute(
        currentTokenizedOriginalInputToken,
        headers,
        legacyCtx,
        deeplApiSecretKey,
        target_lang,
        craftedOptions.corsProxyPrefix,
        craftedOptions.pushBodyDirectlyInUrl,
        craftedOptions.sourceLang
      );
      const request = buildRequest(headers, body);
      const maxRetry = legacyCtx ? 1 : CORS_PROXY_MAX_RETRY;
      const doBreak = (n: number) => (n < maxRetry);
      for (let i: number = 0; !doBreak(i); i++) {
        try {
          const tryToProcessFetchWrapper = async () => {
            const deeplOutput = await tryToProcessFetch(
              deeplApiRoute,
              deeplApiSecretKey,
              request
            );
            tokenizedDeeplOutputs.push(deeplOutput);
          };
          if (i > 0) {
            await wait(RETRY_DELAY);
          }
          await tryToProcessFetchWrapper();
        } catch (error) {
          if (doBreak(i + 1)) {
            throw new Error("Failed to fetch");
          }
        }
      }
    }
  } catch (error) {
    throw error;
  }

  const mergedResult = mergeTokenizedDeeplDriverInput(
    tokenizedDeeplOutputs,
    inputOriginalKeys
  );
  // * ... Merged DeepL results: mergedResult
  return mergedResult;
}

export async function tryToGetDeeplTranslation(
  originalInput: DeeplDriverInputType,
  targetLangSymbol: DeeplLanguageSymbol,
  customOptions: IDeeplTranslationOptions = {}
): Promise<DeeplDriverInputType> {
  const wasPlainStringInput = typeof originalInput === "string";
  try {
    tryToValidateTextArgument(originalInput);
  } catch (error) {
    throw error;
  }
  const tokenizedOriginalInput: TokenizedDeeplDriverInputType =
    tokenizeDeeplDriverInput(originalInput);
  // * ... Splitted your original input into ${DEEPL_API_MAX_DATA_CHUNK_SIZE}-characters max sized chunks: tokenizedOriginalInput
  try {
    const processedTokenizedOriginalInput =
      await tryToProcessTokenizedOriginalInput(
        tokenizedOriginalInput,
        targetLangSymbol,
        customOptions
      );
    if (wasPlainStringInput) {
      return (processedTokenizedOriginalInput as string[])[0];
    }
    return processedTokenizedOriginalInput;
  } catch {
    try {
      // * ... Triggered retry context, now trying to call DeepL via a Cors Proxy
      const processedTokenizedOriginalInput =
        await tryToProcessTokenizedOriginalInput(
          tokenizedOriginalInput,
          targetLangSymbol,
          (customOptions = {
            corsProxyPrefix: CORS_PROXY_PREFIX_FOR_RESCUE_CTX,
          })
        );
      if (wasPlainStringInput) {
        return (processedTokenizedOriginalInput as string[])[0];
      }
      return processedTokenizedOriginalInput;
    } catch (error) {
      throw error;
    }
  }
}

export default tryToGetDeeplTranslation;
