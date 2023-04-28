# DeepL Driver

This custom DeepL Driver is designed to do fewer API Calls (_it partitions your input to make each request as close as possible to the maximum number of characters per request allowed by DeepL_).

## Polymorphic input

Compatible with:
- _string_ inputs
  - `'This is a test'`
- _string arrays_ inputs
  - `['This is a test', 'This is an another test']`
- `Record<string, string>` inputs
  - `{key_a: 'This is a test', key_b: 'This is an another test'}`

## Use it anywhere!

Backend & Frontend compatible (even if it is discouraged to use DeepL API calls from a frontend), via a [Cors.sh](https://cors.sh) proxy if needed.

## Good practices

Before ANY use of this driver in your Frontend, read carefully [DeepL recommandations](https://support.deepl.com/hc/en-us/articles/7869276014748-API-request-blocked-by-CORS-policy-).

> ⚠️ **The only relevant use case of this driver in Frontend is the realization of an alternative front in which the user must enter his API key.**
> 
> ⛔ **Don't expose your API key in your frontend.**

---

<p align="center"><em>This GitHub repository is not part of the DeepL website or DeepL, SE.<br>Additionally, this GitHub repository is NOT endorsed by DeepL in any way.<br>DeepL is a trademark of DeepL, SE.</em></p>