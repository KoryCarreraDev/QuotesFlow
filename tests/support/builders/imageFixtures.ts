// Imágenes mínimas para probar la validación del logo (F3-T07). Se arman byte a byte para controlar sus medidas.

const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';
const PNG_HEADER_LENGTH = 33;
const PNG_CHUNK_LENGTH_OFFSET = 8;
const PNG_HEADER_CHUNK_LENGTH = 13;
const PNG_CHUNK_TYPE_OFFSET = 12;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_DEPTH_OFFSET = 24;
// Profundidad 8, color RGB, compresión, filtro y entrelazado en 0.
const PNG_HEADER_DETAILS_HEX = '0802000000';

/** PNG con las medidas indicadas en su cabecera IHDR (el resto del archivo no hace falta para validarlas). */
export function buildPngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(PNG_HEADER_LENGTH);
  Buffer.from(PNG_SIGNATURE_HEX, 'hex').copy(header, 0);
  header.writeUInt32BE(PNG_HEADER_CHUNK_LENGTH, PNG_CHUNK_LENGTH_OFFSET);
  header.write('IHDR', PNG_CHUNK_TYPE_OFFSET, 'ascii');
  header.writeUInt32BE(width, PNG_WIDTH_OFFSET);
  header.writeUInt32BE(height, PNG_HEIGHT_OFFSET);
  Buffer.from(PNG_HEADER_DETAILS_HEX, 'hex').copy(header, PNG_DEPTH_OFFSET);
  return header;
}

const JPEG_START_OF_IMAGE_HEX = 'ffd8';
// Segmento JFIF: marcador APP0, longitud 16, "JFIF\0" y 9 bytes de datos.
const JPEG_APP0_HEX = 'ffe00010';
const JPEG_APP0_DATA_LENGTH = 9;
// Segmento de imagen SOF0: marcador, longitud 17, precisión 8; luego alto, ancho y tres componentes.
const JPEG_FRAME_LENGTH = 19;
const JPEG_FRAME_PREFIX_HEX = 'ffc0001108';
const JPEG_FRAME_HEIGHT_OFFSET = 5;
const JPEG_FRAME_WIDTH_OFFSET = 7;
const JPEG_FRAME_COMPONENTS_OFFSET = 9;
const JPEG_FRAME_COMPONENTS_HEX = '03011100021100031100';
const JPEG_START_OF_SCAN_HEX = 'ffda000c03010002110311003f00';
const JPEG_END_OF_IMAGE_HEX = 'ffd9';

/** JPEG con un segmento JFIF, uno de imagen (SOF0) con las medidas indicadas y el inicio de datos. */
export function buildJpeg(width: number, height: number): Buffer {
  const jfif = Buffer.concat([
    Buffer.from(JPEG_APP0_HEX, 'hex'),
    Buffer.from('JFIF\0', 'ascii'),
    Buffer.alloc(JPEG_APP0_DATA_LENGTH),
  ]);
  const frame = Buffer.alloc(JPEG_FRAME_LENGTH);
  Buffer.from(JPEG_FRAME_PREFIX_HEX, 'hex').copy(frame, 0);
  frame.writeUInt16BE(height, JPEG_FRAME_HEIGHT_OFFSET);
  frame.writeUInt16BE(width, JPEG_FRAME_WIDTH_OFFSET);
  Buffer.from(JPEG_FRAME_COMPONENTS_HEX, 'hex').copy(frame, JPEG_FRAME_COMPONENTS_OFFSET);
  return Buffer.concat([
    Buffer.from(JPEG_START_OF_IMAGE_HEX, 'hex'),
    jfif,
    frame,
    Buffer.from(JPEG_START_OF_SCAN_HEX, 'hex'),
    Buffer.from(JPEG_END_OF_IMAGE_HEX, 'hex'),
  ]);
}
