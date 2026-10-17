import "server-only";
import sharp from "sharp";
import { BrandError, brandPalette, MAX_LOGO_BYTES } from "./domain";

export async function normalizeLogo(input: Uint8Array) {
  if (!input.length || input.length > MAX_LOGO_BYTES || !Buffer.from(input.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new BrandError("Envie um PNG válido até 256 KiB.");
  try {
    const bytes = Buffer.from(input); let ended = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
      if (length > bytes.length - offset - 12 || type === "acTL") throw new Error("invalid or animated PNG");
      offset += length + 12;
      if (type === "IEND") { ended = length === 0; break; }
    }
    if (!ended) throw new Error("incomplete PNG");
    const image = sharp(input, { limitInputPixels: 1024 * 1024, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height || metadata.width < 16 || metadata.height < 16 || metadata.width > 1024 || metadata.height > 1024 || (metadata.pages ?? 1) !== 1) throw new Error("dimensions");
    const result = await image.resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    if (result.length > 512 * 1024) throw new Error("size");
    return result;
  } catch { throw new BrandError("O logótipo deve ser um PNG estático de 16 a 1024 píxeis por lado, sem erros de imagem."); }
}
export async function brandIcons(primaryColor: string, logo: Uint8Array | null) {
  // Only validated hex colours enter this internal SVG; no user markup or remote assets.
  const source = logo ?? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${primaryColor}"/><path d="M118 128h276v68H290v188h-68V196H118z" fill="${brandPalette(primaryColor, primaryColor).onPrimary}"/></svg>`);
  const icon = (size: number) => sharp(source, { limitInputPixels: 1024 * 1024 }).resize(size, size, { fit: "contain", background: primaryColor }).png({ compressionLevel: 9 }).toBuffer();
  const [icon192, icon512] = await Promise.all([icon(192), icon(512)]);
  return { icon192, icon512 };
}
