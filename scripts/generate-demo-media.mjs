// Renders the demo mode's media into src/demo/assets/ with ffmpeg: three short
// silent reels (VP9 WebM, 360x640, a slow zoom over a photo), their posters, and
// a voice message (Opus). WebM because every engine the app is tested on plays
// it (Instagram itself serves H.264 MP4, which GeckoView on the glasses plays).
//
// Usage: node scripts/generate-demo-media.mjs <photo1> <photo2> <photo3>
// The photos are portrait JPEGs (the demo's came from picsum.photos, Unsplash license).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'src', 'demo', 'assets');
const names = ['ridge', 'tulips', 'market'];
const photos = process.argv.slice(2);
if (photos.length !== names.length) {
  console.error(`usage: node scripts/generate-demo-media.mjs ${names.map(name => `<${name}.jpg>`).join(' ')}`);
  process.exit(1);
}
fs.mkdirSync(out, {recursive: true});

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'inherit'});

names.forEach((name, index) => {
  const photo = photos[index];
  const frames = 6 * 24;
  ffmpeg(
    '-loop', '1', '-i', photo, '-t', '6',
    '-vf', `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=z='1+0.12*on/${frames}':d=${frames}:s=360x640:fps=24,format=yuv420p`,
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-an',
    path.join(out, `${name}.webm`),
  );
  ffmpeg('-i', photo, '-vf', 'scale=360:640:force_original_aspect_ratio=increase,crop=360:640', '-quality', '70', path.join(out, `${name}.webp`));
});

// A voice message: a few seconds of a voice-like tone (the demo transcript is scripted).
ffmpeg(
  '-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*(180+40*sin(2*PI*3*t))*t)*(0.5+0.5*sin(2*PI*1.7*t))':s=16000:d=5",
  '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', path.join(out, 'voice.ogg'),
);

for (const file of fs.readdirSync(out).sort()) {
  console.log(`${file} ${fs.statSync(path.join(out, file)).size} B`);
}
