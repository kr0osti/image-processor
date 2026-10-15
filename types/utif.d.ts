// Minimal typings for the parts of UTIF.js (https://github.com/photopea/UTIF.js) used in lib/image-import.ts
declare module 'utif' {
  interface IFD {
    width: number
    height: number
    [key: string]: unknown
  }
  const UTIF: {
    decode(buffer: ArrayBuffer): IFD[]
    decodeImage(buffer: ArrayBuffer, ifd: IFD): void
    toRGBA8(ifd: IFD): Uint8Array
  }
  export default UTIF
}
