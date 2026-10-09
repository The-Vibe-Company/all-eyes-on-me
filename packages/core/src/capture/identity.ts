import type { Page } from "playwright";

/** What a page looks like as a brand: its fonts, its colours, its gradients, its logo. */
export interface PageIdentity {
  /** The font each text is set in (the first family it asks for), sorted. */
  fonts: string[];
  /** Every colour in use, as `#rrggbb`: text, backgrounds, borders and the stops of gradients. Sorted. */
  palette: string[];
  /** The background gradients, their colours as `#rrggbb`. Sorted. */
  gradients: string[];
  /** The text of the brand in the header, or null when the page has none. */
  logo: string | null;
}

/** Reads the page's identity as the browser draws it. */
export async function readIdentity(page: Page): Promise<PageIdentity> {
  return page.evaluate(() => {
    const hex = (rgb: string): string | null => {
      const m = rgb.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.1)) return null;
      return "#" + [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, "0")).join("");
    };
    const fonts = new Set<string>(), palette = new Set<string>(), gradients = new Set<string>();
    const add = (colour: string) => { const h = hex(colour); if (h) palette.add(h); };
    for (const el of document.querySelectorAll<HTMLElement>("body, body *")) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if ([...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) {
        fonts.add(s.fontFamily.split(",")[0]!.replace(/["']/g, "").trim());
        add(s.color);
      }
      add(s.backgroundColor);
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (s[`border${side}Style`] !== "none" && parseFloat(s[`border${side}Width`]) > 0) add(s[`border${side}Color`]);
      }
      if (s.backgroundImage.includes("gradient")) {
        const stops = s.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [];
        stops.forEach(add);
        gradients.add(s.backgroundImage.replace(/rgba?\([^)]*\)/g, (c) => hex(c) ?? "transparent"));
      }
    }
    const brand = document.querySelector("header h1, header .brand, header .logo, header [class*='logo'], header a[href='/']");
    const logo = brand?.textContent?.replace(/\s+/g, " ").trim() || null;
    return { fonts: [...fonts].sort(), palette: [...palette].sort(), gradients: [...gradients].sort(), logo };
  });
}
