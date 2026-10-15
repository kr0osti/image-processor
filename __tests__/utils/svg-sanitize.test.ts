/**
 * @jest-environment jsdom
 */
import { sanitizeSvg } from '@/lib/image-import'

const SVG_NS = 'http://www.w3.org/2000/svg'

const malicious = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="624" height="400" viewBox="-14 -30 165.1 105.83333" onload="alert(1)">
  <script>alert(2)</script>
  <foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
  <a href="javascript:alert(3)"><rect width="10" height="10"/></a>
  <path d="M10 10 L120 10 L100 50 Z" fill="#1e3a8a" onclick="alert(4)"/>
</svg>`

describe('sanitizeSvg', () => {
  it('removes scripts, event handlers, foreignObject and javascript: links', async () => {
    const clean = await sanitizeSvg(malicious)
    expect(clean).not.toMatch(/<script|onload|onclick|foreignObject|javascript:/i)
  })

  it('keeps a renderable SVG document with its drawing and dimensions', async () => {
    const doc = new DOMParser().parseFromString(await sanitizeSvg(malicious), 'image/svg+xml')
    const svg = doc.documentElement
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(svg.namespaceURI).toBe(SVG_NS)
    expect(svg.getAttribute('viewBox')).toBe('-14 -30 165.1 105.83333')
    expect(svg.getAttribute('width')).toBe('624')
    expect(svg.getElementsByTagName('path')).toHaveLength(1)
  })
})
