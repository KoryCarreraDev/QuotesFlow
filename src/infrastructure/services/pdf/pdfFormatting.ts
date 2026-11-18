// Texto que la fuente estándar del PDF puede dibujar (F3-T06).

const REPLACEMENT_CHARACTER = '?';
const TAB_REPLACEMENT = '    ';
const LINE_BREAK_PATTERN = /\r\n|\r|\n/;

/**
 * Líneas de texto que la fuente estándar del PDF puede dibujar. Las fuentes estándar solo codifican WinAnsi
 * (español incluido: tildes, ñ, ¿, ¡); cualquier otro carácter, o un control, haría fallar el dibujo, así que se
 * cambia por `?`. Los saltos de línea del texto se conservan como líneas separadas.
 */
export function toDrawableLines(text: string, isSupportedCodePoint: (codePoint: number) => boolean): string[] {
  return text.split(LINE_BREAK_PATTERN).map((line) =>
    Array.from(line.replaceAll('\t', TAB_REPLACEMENT))
      .map((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return isSupportedCodePoint(codePoint) ? character : REPLACEMENT_CHARACTER;
      })
      .join(''),
  );
}
