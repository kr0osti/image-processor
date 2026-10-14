import {
  computeDrawRect,
  countWhitePixels,
  findContentBounds,
  getSampleRegions,
  hasSignificantPadding,
  isWhiteBackground,
  getUpscaleFactor,
  isUpscaled,
  isWhitePixel,
  resolveWhiteBackground,
  scaleBounds,
} from '@/lib/image-layout'

// Builds RGBA data where every pixel has the same value
const fill = (pixels: number, rgba: [number, number, number, number]): number[] =>
  Array.from({ length: pixels }, () => rgba).flat()

describe('isWhitePixel', () => {
  it('accepts near-white opaque pixels', () => {
    expect(isWhitePixel(255, 255, 255, 255)).toBe(true)
    expect(isWhitePixel(241, 241, 241, 255)).toBe(true)
  })

  it('rejects pixels with any channel at or below 240', () => {
    expect(isWhitePixel(240, 255, 255, 255)).toBe(false)
    expect(isWhitePixel(255, 255, 0, 255)).toBe(false)
  })

  it('treats mostly transparent pixels as white', () => {
    expect(isWhitePixel(0, 0, 0, 49)).toBe(true)
    expect(isWhitePixel(0, 0, 0, 50)).toBe(false)
  })
})

describe('countWhitePixels', () => {
  it('samples every 4th pixel', () => {
    expect(countWhitePixels(fill(8, [255, 255, 255, 255]))).toEqual({ white: 2, total: 2 })
  })

  it('counts only white samples', () => {
    // Sampled pixels are 0 and 4: one white, one black
    const data = [...fill(4, [255, 255, 255, 255]), ...fill(4, [0, 0, 0, 255])]
    expect(countWhitePixels(data)).toEqual({ white: 1, total: 2 })
  })

  it('handles empty data', () => {
    expect(countWhitePixels([])).toEqual({ white: 0, total: 0 })
  })
})

describe('isWhiteBackground', () => {
  it('requires more than 85% white samples', () => {
    expect(isWhiteBackground(86, 100)).toBe(true)
    expect(isWhiteBackground(85, 100)).toBe(false)
  })

  it('is false when nothing was sampled', () => {
    expect(isWhiteBackground(0, 0)).toBe(false)
  })
})

describe('resolveWhiteBackground', () => {
  it('runs detection when there is no override', () => {
    const detect = jest.fn(() => true)
    expect(resolveWhiteBackground(undefined, detect)).toBe(true)
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])('uses the override (%s) without running detection', (override) => {
    const detect = jest.fn(() => !override)
    expect(resolveWhiteBackground(override, detect)).toBe(override)
    expect(detect).not.toHaveBeenCalled()
  })
})

// White RGBA image of the given size with black pixels at the listed [x, y] points
const imageWith = (width: number, height: number, black: [number, number][]): number[] => {
  const data = fill(width * height, [255, 255, 255, 255])
  for (const [x, y] of black) {
    data.splice((y * width + x) * 4, 4, 0, 0, 0, 255)
  }
  return data
}

describe('findContentBounds', () => {
  it('returns the box around the non-white pixels', () => {
    const data = imageWith(10, 8, [[2, 3], [6, 5]])
    expect(findContentBounds(data, 10, 8)).toEqual({ x: 2, y: 3, width: 5, height: 3 })
  })

  it('covers the whole image when content touches every edge', () => {
    const data = imageWith(4, 4, [[0, 0], [3, 3]])
    expect(findContentBounds(data, 4, 4)).toEqual({ x: 0, y: 0, width: 4, height: 4 })
  })

  it('returns null for an all-white image', () => {
    expect(findContentBounds(imageWith(5, 5, []), 5, 5)).toBeNull()
  })
})

describe('scaleBounds', () => {
  it('scales back to the original size', () => {
    expect(scaleBounds({ x: 10, y: 20, width: 30, height: 40 }, 2, 1000, 1000)).toEqual({ x: 20, y: 40, width: 60, height: 80 })
  })

  it('rounds outwards so content is not cut off', () => {
    expect(scaleBounds({ x: 1, y: 1, width: 1, height: 1 }, 1.5, 100, 100)).toEqual({ x: 1, y: 1, width: 2, height: 2 })
  })

  it('clamps to the image edges', () => {
    expect(scaleBounds({ x: 0, y: 0, width: 10, height: 10 }, 3.3, 30, 30)).toEqual({ x: 0, y: 0, width: 30, height: 30 })
  })
})

describe('hasSignificantPadding', () => {
  it('is true when trimming removes at least 10% of the width or height', () => {
    expect(hasSignificantPadding({ x: 50, y: 0, width: 900, height: 1000 }, 1000, 1000)).toBe(true)
    expect(hasSignificantPadding({ x: 0, y: 50, width: 1000, height: 900 }, 1000, 1000)).toBe(true)
  })

  it('is false for a thin margin', () => {
    expect(hasSignificantPadding({ x: 20, y: 20, width: 960, height: 960 }, 1000, 1000)).toBe(false)
  })

  it('is false when there is no content', () => {
    expect(hasSignificantPadding(null, 1000, 1000)).toBe(false)
  })
})

describe('getSampleRegions', () => {
  it('samples a 5% band on each edge plus the center', () => {
    expect(getSampleRegions(1000, 800)).toEqual([
      { x: 0, y: 0, width: 1000, height: 40 },
      { x: 0, y: 760, width: 1000, height: 40 },
      { x: 0, y: 40, width: 40, height: 720 },
      { x: 960, y: 40, width: 40, height: 720 },
      { x: 250, y: 200, width: 500, height: 400 },
    ])
  })

  it('uses at least a 10px band on small images', () => {
    expect(getSampleRegions(100, 100)[0].height).toBe(10)
  })
})

describe('computeDrawRect', () => {
  describe('with white background', () => {
    it('fits a square image into the padded 1200px area', () => {
      expect(computeDrawRect(500, 500, true)).toEqual({ x: 150, y: 150, width: 1200, height: 1200 })
    })

    it('fits a landscape image by its width and centers it', () => {
      expect(computeDrawRect(2000, 1000, true)).toEqual({ x: 150, y: 450, width: 1200, height: 600 })
    })

    it('fits a portrait image by its height and centers it', () => {
      expect(computeDrawRect(1000, 2000, true)).toEqual({ x: 450, y: 150, width: 600, height: 1200 })
    })
  })

  describe('without white background', () => {
    it('fills the canvas with a square image', () => {
      expect(computeDrawRect(500, 500, false)).toEqual({ x: 0, y: 0, width: 1500, height: 1500 })
    })

    it('takes the full width for a landscape image', () => {
      expect(computeDrawRect(2000, 1000, false)).toEqual({ x: 0, y: 375, width: 1500, height: 750 })
    })

    it('takes the full height for a portrait image', () => {
      expect(computeDrawRect(1000, 2000, false)).toEqual({ x: 375, y: 0, width: 750, height: 1500 })
    })
  })

  it('fills the frame with trimmed content when padding is removed', () => {
    // A 1000x1000 source with a 400x400 product: trimming makes the product fill the canvas
    expect(computeDrawRect(400, 400, false)).toEqual({ x: 0, y: 0, width: 1500, height: 1500 })
  })

  it('gives different layouts when the toggle is flipped', () => {
    expect(computeDrawRect(800, 600, true)).not.toEqual(computeDrawRect(800, 600, false))
  })
})

describe('isWhiteBackground with a custom threshold', () => {
  it('uses the given share instead of the default', () => {
    expect(isWhiteBackground(71, 100, 0.7)).toBe(true)
    expect(isWhiteBackground(86, 100, 0.9)).toBe(false)
  })
})

describe('computeDrawRect with a custom padding', () => {
  it('fits white-background images into the smaller or larger content area', () => {
    expect(computeDrawRect(500, 500, true, 1500, 100)).toEqual({ x: 100, y: 100, width: 1300, height: 1300 })
    expect(computeDrawRect(500, 500, true, 1500, 0)).toEqual({ x: 0, y: 0, width: 1500, height: 1500 })
  })
})

describe('getUpscaleFactor / isUpscaled', () => {
  it('reports how much a small source is enlarged', () => {
    const rect = computeDrawRect(500, 500, true)
    expect(getUpscaleFactor(500, 500, rect)).toBeCloseTo(2.4)
    expect(isUpscaled(getUpscaleFactor(500, 500, rect))).toBe(true)
  })

  it('does not flag sources that are scaled down or kept at size', () => {
    expect(isUpscaled(getUpscaleFactor(3000, 2000, computeDrawRect(3000, 2000, false)))).toBe(false)
    expect(isUpscaled(getUpscaleFactor(1500, 1500, computeDrawRect(1500, 1500, false)))).toBe(false)
    expect(isUpscaled(getUpscaleFactor(1200, 1200, computeDrawRect(1200, 1200, true)))).toBe(false)
  })
})
