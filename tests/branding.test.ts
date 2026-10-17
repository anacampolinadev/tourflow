import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { brandInput, brandPalette, contrast } from "../src/modules/branding/domain";
import { normalizeLogo, brandIcons } from "../src/modules/branding/images";
describe("tenant identity validation", () => {
  it("normalizes only strict hex colours and rejects markup/CSS or unknown configuration fields", () => {
    expect(brandInput.parse({ displayName: "  Serra Tours  ", primaryColor: "#AA22BB", secondaryColor: "#FFFFFF" })).toEqual({ displayName: "Serra Tours", primaryColor: "#aa22bb", secondaryColor: "#ffffff" });
    for (const color of ["red", "#fff", "url(https://example.test)", "#fff;background:red", "</style>"]) expect(brandInput.safeParse({ displayName: "Tours", primaryColor: color, secondaryColor: "#ffffff" }).success).toBe(false);
    expect(brandInput.safeParse({ displayName: "Tours", primaryColor: "#123456", secondaryColor: "#ffffff", domain: "other.example" }).success).toBe(false);
  });
  it("keeps foregrounds and links readable for light, dark and intermediate brand colours", () => {
    for (const primary of ["#ffffff", "#000000", "#777777", "#ffff00", "#ff66ff", "#0f6b4a"]) {
      const palette = brandPalette(primary, primary);
      expect(contrast(primary, palette.onPrimary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(primary, palette.onSecondary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#ffffff", palette.link)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("rejects wrong formats, damaged images, oversized bytes and pixel dimensions", async () => {
    for (const input of [Buffer.from('<svg onload="alert(1)"/>'), Buffer.alloc(256 * 1024 + 1), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])]) await expect(normalizeLogo(input)).rejects.toThrow();
    const tooWide = await sharp({ create: { width: 1025, height: 16, channels: 3, background: "red" } }).png().toBuffer();
    await expect(normalizeLogo(tooWide)).rejects.toThrow();
  });
  it("re-encodes PNG bytes, discards appended content and creates bounded square icons", async () => {
    const original = await sharp({ create: { width: 600, height: 300, channels: 4, background: "#ff33aa" } }).png().toBuffer();
    const canonical = await normalizeLogo(Buffer.concat([original, Buffer.from("<script>secret-marker</script>")]));
    expect(canonical.includes(Buffer.from("secret-marker"))).toBe(false);
    expect(await sharp(canonical).metadata()).toMatchObject({ width: 384, height: 192, format: "png" });
    const icons = await brandIcons("#ffffff", canonical);
    expect(await sharp(icons.icon192).metadata()).toMatchObject({ width: 192, height: 192 });
    expect(await sharp(icons.icon512).metadata()).toMatchObject({ width: 512, height: 512 });
    expect(icons.icon512.length).toBeLessThan(1024 * 1024);
  });
});
