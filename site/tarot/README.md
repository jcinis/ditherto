# Tarot studies

Five PNG masters supplied for the ditherto examples: The Fool, The Magician, The High Priestess, The Empress, and The Emperor. Their filenames and pixels are preserved unchanged.

The homepage and playgrounds load full-color **768 × 1365 WebP sources**, encoded at quality 90 after area downsampling. All five total approximately **1.79 MB**, compared with **16.03 MB** for the PNG masters (88.8% smaller). These are source images, not pre-dithered exports: changing palette, exposure, contrast or display size still rerenders from the cached decoded source. Final canvases and PNG downloads keep exact palette colors.

Compression and source resizing change some fine detail and dither patterns compared with the masters. The 768px examples are intended for website-sized previews; upload a full-resolution image in the playground for larger exports. User uploads are not passed through this sample-asset optimization.

Rebuild after `npm run build` with `node scripts/generate-tarot-previews.mjs`, or run `npm run assets:site` for all documentation/site assets. The script always starts from the PNG masters, never recompresses an earlier WebP.

These artworks are separate from the MIT-licensed library code; this file grants no additional artwork license. They are not included in the npm package.
