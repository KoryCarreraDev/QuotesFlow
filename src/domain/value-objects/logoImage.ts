// Logo de una empresa (F3-T07). El tipo de archivo se decide por sus primeros bytes, nunca por el nombre ni por el
// tipo que declare el cliente. Solo PNG y JPEG: son los formatos que el PDF (F3-T06) incrusta, y SVG queda fuera
// porque puede llevar scripts.

export type LogoFormat = 'png' | 'jpeg';

export interface LogoImageInfo {
  format: LogoFormat;
  contentType: 'image/png' | 'image/jpeg';
  /** Extensión del archivo guardado, sin punto. */
  extension: 'png' | 'jpg';
  width: number;
  height: number;
}

const BYTES_PER_MEBIBYTE = 1_048_576;
const LOGO_MAXIMUM_MEBIBYTES = 2;
/** Tamaño máximo del archivo: un logo no necesita más y limita lo que se lee en memoria. */
export const LOGO_MAXIMUM_BYTES = LOGO_MAXIMUM_MEBIBYTES * BYTES_PER_MEBIBYTE;
/**
 * Lado máximo en píxeles. Un PNG pequeño puede descomprimirse a una imagen enorme; al incrustarlo en el PDF se
 * decodifica entera, así que el tamaño en píxeles también tiene tope.
 */
export const LOGO_MAXIMUM_SIDE_PIXELS = 2000;

// PNG: firma de 8 bytes y, justo después, el bloque IHDR (longitud 4 + tipo 4 + ancho 4 + alto 4).
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_HEADER_CHUNK_TYPE = Buffer.from('IHDR', 'ascii');
const PNG_HEADER_CHUNK_TYPE_OFFSET = 12;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_MINIMUM_LENGTH = 24;

// JPEG: comienza con FFD8FF y sigue una serie de segmentos `FF <marcador> <longitud de 2 bytes> <datos>`. Las
// medidas están en el primer segmento de imagen (SOFn).
const JPEG_SIGNATURE = Buffer.from('ffd8ff', 'hex');
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_FIRST_FRAME_MARKER = 0xc0;
const JPEG_LAST_FRAME_MARKER = 0xcf;
// Dentro de C0..CF, estos tres no son de imagen: tablas de Huffman, extensión y codificación aritmética.
const JPEG_HUFFMAN_TABLE_MARKER = 0xc4;
const JPEG_EXTENSION_MARKER = 0xc8;
const JPEG_ARITHMETIC_CODING_MARKER = 0xcc;
// Marcadores sueltos, sin longitud ni datos.
const JPEG_RESTART_FIRST_MARKER = 0xd0;
const JPEG_RESTART_LAST_MARKER = 0xd7;
const JPEG_TEMPORARY_MARKER = 0x01;
const JPEG_MARKER_BYTES = 2;
const JPEG_LENGTH_FIELD_BYTES = 2;
const JPEG_SEGMENT_HEADER_BYTES = JPEG_MARKER_BYTES + JPEG_LENGTH_FIELD_BYTES;
const JPEG_FRAME_HEIGHT_OFFSET = 5;
const JPEG_FRAME_WIDTH_OFFSET = 7;
const JPEG_FRAME_MINIMUM_LENGTH = 9;

interface ImageSize {
  width: number;
  height: number;
}

/** Los bytes de `offset` en adelante empiezan por `expected`. */
function hasBytesAt(bytes: Uint8Array, expected: Uint8Array, offset: number): boolean {
  return Buffer.from(bytes.subarray(offset, offset + expected.length)).equals(expected);
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function inspectPng(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < PNG_MINIMUM_LENGTH) return undefined;
  if (!hasBytesAt(bytes, PNG_SIGNATURE, 0) || !hasBytesAt(bytes, PNG_HEADER_CHUNK_TYPE, PNG_HEADER_CHUNK_TYPE_OFFSET)) {
    return undefined;
  }
  const view = viewOf(bytes);
  return { width: view.getUint32(PNG_WIDTH_OFFSET), height: view.getUint32(PNG_HEIGHT_OFFSET) };
}

function isFrameMarker(marker: number): boolean {
  return (
    marker >= JPEG_FIRST_FRAME_MARKER &&
    marker <= JPEG_LAST_FRAME_MARKER &&
    marker !== JPEG_HUFFMAN_TABLE_MARKER &&
    marker !== JPEG_EXTENSION_MARKER &&
    marker !== JPEG_ARITHMETIC_CODING_MARKER
  );
}

function isStandaloneMarker(marker: number): boolean {
  return (
    marker === JPEG_TEMPORARY_MARKER || (marker >= JPEG_RESTART_FIRST_MARKER && marker <= JPEG_RESTART_LAST_MARKER)
  );
}

function inspectJpeg(bytes: Uint8Array): ImageSize | undefined {
  if (!hasBytesAt(bytes, JPEG_SIGNATURE, 0)) return undefined;
  const view = viewOf(bytes);
  let position = JPEG_MARKER_BYTES;
  // Cada vuelta lee el marcador (2 bytes) y la longitud del segmento (2 bytes).
  while (position + JPEG_SEGMENT_HEADER_BYTES <= bytes.length) {
    if (view.getUint8(position) !== JPEG_MARKER_PREFIX) return undefined;
    const marker = view.getUint8(position + 1);
    // Relleno entre segmentos: bytes 0xFF repetidos.
    if (marker === JPEG_MARKER_PREFIX) {
      position += 1;
      continue;
    }
    if (isStandaloneMarker(marker)) {
      position += JPEG_MARKER_BYTES;
      continue;
    }
    // Sin imagen antes de los datos o del final: no hay medidas que leer.
    if (marker === JPEG_START_OF_SCAN || marker === JPEG_END_OF_IMAGE) return undefined;

    const segmentLength = view.getUint16(position + JPEG_MARKER_BYTES);
    if (isFrameMarker(marker)) {
      if (segmentLength < JPEG_FRAME_MINIMUM_LENGTH || position + JPEG_MARKER_BYTES + segmentLength > bytes.length) {
        return undefined;
      }
      return {
        height: view.getUint16(position + JPEG_FRAME_HEIGHT_OFFSET),
        width: view.getUint16(position + JPEG_FRAME_WIDTH_OFFSET),
      };
    }
    // La longitud incluye sus propios 2 bytes: menos que eso es un archivo corrupto (y evitaría avanzar).
    if (segmentLength < JPEG_MARKER_BYTES) return undefined;
    position += JPEG_MARKER_BYTES + segmentLength;
  }
  return undefined;
}

/**
 * Datos del logo si el contenido es un PNG o JPEG de tamaño razonable; `undefined` si no lo es.
 *
 * @returns `undefined` para otro formato, un archivo truncado, medidas en cero o por encima de
 * `LOGO_MAXIMUM_SIDE_PIXELS`, o más de `LOGO_MAXIMUM_BYTES`.
 */
export function inspectLogoImage(bytes: Uint8Array): LogoImageInfo | undefined {
  if (bytes.length === 0 || bytes.length > LOGO_MAXIMUM_BYTES) return undefined;

  const pngSize = inspectPng(bytes);
  const size = pngSize ?? inspectJpeg(bytes);
  if (!size) return undefined;
  const { width, height } = size;
  if (width < 1 || height < 1 || width > LOGO_MAXIMUM_SIDE_PIXELS || height > LOGO_MAXIMUM_SIDE_PIXELS) {
    return undefined;
  }
  return pngSize
    ? { format: 'png', contentType: 'image/png', extension: 'png', width, height }
    : { format: 'jpeg', contentType: 'image/jpeg', extension: 'jpg', width, height };
}
