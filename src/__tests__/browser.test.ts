// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoDitherDOM, ditherImageElement, parseDataAttributes } from '../browser.js';
import { loadImageData } from '../imageIO.js';

function pixels(width: number, height: number) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255),
    colorSpace: 'srgb',
  } as ImageData;
}
function image(loaded = true) {
  const img = document.createElement('img');
  Object.defineProperties(img, {
    complete: { value: loaded, configurable: true },
    naturalWidth: { value: 4 },
    naturalHeight: { value: 2 },
  });
  img.width = 400;
  img.height = 200;
  img.alt = 'A white landscape';
  img.id = 'source';
  img.className = 'picture';
  document.body.append(img);
  return img;
}
let context: {
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  document.body.replaceChildren();
  context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x, _y, w, h) => pixels(w, h)),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
});
afterEach(() => vi.restoreAllMocks());

describe('actual DOM helper behavior', () => {
  it('replaces an image with the processed canvas and accessible description', async () => {
    const img = image();
    img.dataset.width = '2';
    const canvas = await ditherImageElement(img);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('canvas')).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([2, 1]);
    expect(canvas.getAttribute('aria-label')).toBe(img.alt);
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.id).toBe('source');
    expect(context.putImageData).toHaveBeenCalledOnce();
  });

  it('uses natural dimensions, not CSS/HTML display dimensions', async () => {
    const result = await loadImageData(image());
    expect([result.width, result.height]).toEqual([4, 2]);
  });

  it('waits for image loading before reading the canvas', async () => {
    const img = image(false);
    const result = ditherImageElement(img);
    expect(context.drawImage).not.toHaveBeenCalled();
    img.dispatchEvent(new Event('load'));
    await result;
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it('propagates decode errors and leaves the original image in place', async () => {
    const img = image(false);
    const promise = ditherImageElement(img);
    img.dispatchEvent(new Event('error'));
    await expect(promise).rejects.toThrow('decoded');
    expect(document.querySelector('img')).toBe(img);
  });

  it('autoDitherDOM can be awaited and resolves all matching canvases', async () => {
    image().dataset.algorithm = 'atkinson';
    image().dataset.algorithm = 'ordered';
    expect(await autoDitherDOM()).toHaveLength(2);
    expect(document.querySelectorAll('canvas')).toHaveLength(2);
    expect(await autoDitherDOM('.missing')).toEqual([]);
  });

  it('supports detached images and option overrides', async () => {
    const img = image();
    img.remove();
    img.dataset.width = '2';
    const canvas = await ditherImageElement(img, { width: 6 });
    expect([canvas.width, canvas.height]).toEqual([6, 3]);
  });

  it('parses algorithm-specific JSON and rejects malformed JSON', () => {
    const img = image();
    img.dataset.algorithm = 'knoll';
    img.dataset.algorithmOptions = '{"strength":0.2,"candidates":64}';
    expect(parseDataAttributes(img)).toEqual({ algorithm: 'knoll', algorithmOptions: { strength: 0.2, candidates: 64 } });
    img.dataset.algorithmOptions = 'bad json';
    expect(() => parseDataAttributes(img)).toThrow('valid JSON');
  });

  it('parses valid attributes and rejects partial numeric strings', () => {
    const img = image();
    Object.assign(img.dataset, {
      alg: 'ordered',
      resample: 'area',
      width: '200',
      height: '40px',
      step: '1.5',
      quality: '0',
      palette: '[[0,0,0],[255,255,255]]',
      paletteImg: '/palette.png',
      paletteColors: '8',
      exposure: '-0.5',
      contrast: '1.2',
    });
    expect(parseDataAttributes(img)).toEqual({
      algorithm: 'ordered',
      resample: 'area',
      width: 200,
      quality: 0,
      palette: [
        [0, 0, 0],
        [255, 255, 255],
      ],
      paletteImg: '/palette.png',
      paletteColors: 8,
      exposure: -0.5,
      contrast: 1.2,
    });
    img.dataset.resample = 'invalid';
    expect(parseDataAttributes(img).resample).toBeUndefined();
    img.dataset.palette = 'invalid';
    expect(parseDataAttributes(img).palette).toBeUndefined();
  });
});
