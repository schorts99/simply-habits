import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/shared/i18n";

describe("Device language preference order", () => {
  it.each([
    [["en-US", "es-MX"], "en"],
    [["es-MX", "en-US"], "es"],
    [["fr-FR", "es-ES", "en"], "es"],
    [["de", "en-GB", "es"], "en"],
    [["ES-ar"], "es"],
    [["fr", "de"], "en"],
    [[], "en"],
  ])("resolves %j to %s", (languages, expected) => {
    expect(detectLanguage(languages)).toBe(expected);
  });
});
