// Renders the monochrome app icon (white glyph on a transparent background,
// as the Meta docs recommend for glasses icons) into public/icon-*.png.
// Usage: npm run icons
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// A reel and a message: a play triangle in a rounded frame, with a speech tail.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path fill="#ffffff" fill-rule="evenodd" d="
    M156 60h200c53 0 96 43 96 96v152c0 53-43 96-96 96H232l-104 72 16-72c-49-6-84-46-84-96V156c0-53 43-96 96-96z
    M160 108c-26.5 0-48 21.5-48 48v152c0 26.5 21.5 48 48 48h192c26.5 0 48-21.5 48-48V156c0-26.5-21.5-48-48-48z
    M220 168l116 64-116 64z"/>
</svg>`;

for (const size of [192, 512]) {
  const out = path.join(root, 'public', `icon-${size}.png`);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`icon: ${path.relative(root, out)}`);
}
