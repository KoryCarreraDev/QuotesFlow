// Lee las rutas que la aplicación Express tiene registradas de verdad.
// Depende de la estructura interna del router de Express 5 (`app.router.stack`); si una actualización
// de Express la cambia, este es el único archivo que hay que ajustar.

import type { Express } from 'express';

interface RouterLayer {
  /** Presente cuando la capa es una ruta registrada directamente (`app.get(...)`, `router.post(...)`). */
  route?: { path: string; methods: Record<string, boolean> };
  /** Presente cuando la capa monta un router (`app.use('/prefijo', router)`). */
  handle?: { stack?: RouterLayer[] };
  /** Comprueba si la capa atiende la ruta y, si es así, deja en `path` el prefijo que consumió. */
  match: (path: string) => boolean;
  path?: string;
}

const UNKNOWN_MOUNT_PATH = '<prefijo no declarado>';

function describeRouteLayer(mountPath: string, layer: RouterLayer): string[] {
  if (!layer.route) {
    return [];
  }
  const fullPath = `${mountPath}${layer.route.path}`;
  return Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${fullPath}`);
}

// Express no guarda el prefijo con el que se montó un router: se deduce probando rutas conocidas.
function findMountPath(routerLayer: RouterLayer, knownPaths: readonly string[]): string {
  for (const knownPath of knownPaths) {
    if (routerLayer.match(knownPath) && routerLayer.path) {
      return routerLayer.path;
    }
  }
  return UNKNOWN_MOUNT_PATH;
}

/**
 * Devuelve todas las rutas registradas como textos `MÉTODO /ruta/completa`.
 *
 * @param knownPaths Rutas declaradas en el inventario; sirven para deducir el prefijo de cada router montado.
 * Un router cuyo prefijo no aparezca en ellas se reporta con un prefijo desconocido, lo que hace fallar la comparación.
 */
export function listRegisteredRoutes(app: Express, knownPaths: readonly string[]): string[] {
  const rootLayers = (app as unknown as { router: { stack: RouterLayer[] } }).router.stack;
  const registeredRoutes: string[] = [];

  for (const layer of rootLayers) {
    if (layer.route) {
      registeredRoutes.push(...describeRouteLayer('', layer));
      continue;
    }

    const mountedLayers = layer.handle?.stack;
    if (!mountedLayers) {
      continue;
    }

    const mountPath = findMountPath(layer, knownPaths);
    for (const mountedLayer of mountedLayers) {
      registeredRoutes.push(...describeRouteLayer(mountPath, mountedLayer));
    }
  }

  return registeredRoutes;
}
