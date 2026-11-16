// @ts-expect-error el archivo no existe a propósito: es la violación que debe detectar `not-to-unresolvable`.
import { missingValue } from './DoesNotExist.js';

export const adapterWithBrokenImport = missingValue;
