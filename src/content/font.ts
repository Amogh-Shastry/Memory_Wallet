/**
 * Loads the bundled Inter variable font into the host document.
 *
 * The woff2 is inlined as a data URL at build time, so the face never depends
 * on a chrome-extension:// fetch that a host page's CSP or CORS rules can
 * stall. Shadow roots on the page can then use Inter immediately.
 */
import fontUrl from "../assets/fonts/inter-latin-wght-normal.woff2";

const FONT_FAMILY = "Inter";
/** Never let a stalled font decode hold the permission card hostage. */
const FONT_LOAD_TIMEOUT_MS = 1500;

let fontPromise: Promise<boolean> | null = null;

export function ensureContentFont(): Promise<boolean> {
  if (fontPromise) return fontPromise;

  const load = (async () => {
    try {
      if (typeof document === "undefined" || typeof FontFace === "undefined") return false;

      for (const face of document.fonts) {
        if (face.family.replace(/["']/g, "") === FONT_FAMILY && face.status === "loaded") {
          return true;
        }
      }

      const face = new FontFace(FONT_FAMILY, `url("${fontUrl}")`, {
        style: "normal",
        weight: "100 900",
        display: "swap",
      });
      await face.load();
      document.fonts.add(face);
      return true;
    } catch (error) {
      console.warn("[Memory Wallet] Inter font failed to load; using system fallback", error);
      return false;
    }
  })();

  fontPromise = Promise.race([
    load,
    new Promise<boolean>((resolve) =>
      setTimeout(() => {
        console.warn("[Memory Wallet] Inter font load is slow; rendering the card with fallback");
        resolve(false);
      }, FONT_LOAD_TIMEOUT_MS),
    ),
  ]);

  return fontPromise;
}
