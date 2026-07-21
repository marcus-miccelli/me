/**
 * Contact details, base64-obfuscated so neither the served HTML nor the JS
 * bundle contains a greppable email address or profile URL. Decoded only at
 * runtime (render/interaction) — enough to defeat static scrapers and
 * pattern-matching harvesters.
 */

export const getEmail = () => atob("bWFyY3VzbWljY0BnbWFpbC5jb20=");

export const getLinkedInUrl = () =>
  atob("aHR0cHM6Ly93d3cubGlua2VkaW4uY29tL2luL21hcmN1cy1taWNjZWxsaS8=");

export const getGitHubUrl = () =>
  atob("aHR0cHM6Ly9naXRodWIuY29tL21hcmN1cy1taWNjZWxsaQ==");
