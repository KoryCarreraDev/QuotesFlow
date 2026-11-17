// Tipos mínimos de `mjml` 5 (el paquete no trae los suyos). Solo lo que usa `emailTemplateSources.ts`.
declare module 'mjml' {
  interface MjmlOptions {
    filePath?: string;
    validationLevel?: 'strict' | 'soft' | 'skip';
  }
  interface MjmlError {
    line: number;
    message: string;
    tagName: string;
  }
  interface MjmlResult {
    html: string;
    errors: MjmlError[];
  }
  export default function mjml2html(source: string, options?: MjmlOptions): Promise<MjmlResult>;
}
