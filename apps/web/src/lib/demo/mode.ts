/**
 * True only in the GitHub Pages build (`npm run build:pages`), where the API and the
 * simulation run inside the browser. Inlined at build time, so the normal build never
 * takes these branches.
 */
export const BROWSER_DEMO = process.env.NEXT_PUBLIC_AH_BROWSER_DEMO === "1";

export const REPO_URL = "https://github.com/br3ntw/after-hours";
