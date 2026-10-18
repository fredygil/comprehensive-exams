// Where the app is published. GitHub Pages serves the repo at a sub-path, so
// Vite's `base` must match it (vite.config.ts reads BASE_PATH).
export const BASE_PATH = '/comprehensive-exams/'

/** The public app URL, sent to OpenRouter as `HTTP-Referer` for attribution. */
export const APP_URL = `https://fredygil.github.io${BASE_PATH}`

/**
 * Sent to OpenRouter as `X-OpenRouter-Title`. Must stay ASCII: header values
 * are bytes, and "Exámenes" arrives garbled (or makes fetch throw).
 */
export const APP_TITLE = 'Comprehensive Exams'
