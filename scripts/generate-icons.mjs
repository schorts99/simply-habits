import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("public/icons", { recursive: true });
for (const size of [192, 512]) {
  await sharp("public/brand.svg").resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp("public/brand.svg").resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
const foreground = await sharp("public/brand.svg").resize(384, 384).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#52664b" } })
  .composite([{ input: foreground, left: 64, top: 64 }]).png().toFile("public/icons/maskable-512.png");
