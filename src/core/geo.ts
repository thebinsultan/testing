import { BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';

export interface GeometryPart {
  geometry: BufferGeometry;
  /** Optional transform applied to the part before merging. */
  position?: [number, number, number];
  /** Rotation in radians, XYZ order. */
  rotation?: [number, number, number];
  /** Non-uniform scale. */
  scale?: [number, number, number] | number;
}

const _pos = new Vector3();
const _scale = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();
const _matrix = new Matrix4();

function composeMatrix(part: GeometryPart): Matrix4 | null {
  const hasTransform = part.position || part.rotation || part.scale;
  if (!hasTransform) return null;

  _pos.set(...(part.position ?? [0, 0, 0]));
  _euler.set(...(part.rotation ?? [0, 0, 0]));
  _quat.setFromEuler(_euler);
  if (typeof part.scale === 'number') _scale.setScalar(part.scale);
  else _scale.set(...(part.scale ?? [1, 1, 1]));

  return _matrix.compose(_pos, _quat, _scale);
}

/**
 * Minimal, dependency-free geometry merge. Every part is flattened to
 * non-indexed position/normal/uv buffers and concatenated, which is plenty for
 * the hand-built blobs that make up a cat — and it keeps draw calls low.
 *
 * Passed-in geometries are never mutated or disposed (they are usually shared
 * unit primitives); only the temporary copies are cleaned up.
 */
export function mergeParts(parts: GeometryPart[]): BufferGeometry {
  const prepared: BufferGeometry[] = [];
  let vertexCount = 0;

  for (const part of parts) {
    const source = part.geometry;
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    const matrix = composeMatrix(part);
    if (matrix) geometry.applyMatrix4(matrix);
    prepared.push(geometry);
    vertexCount += geometry.getAttribute('position').count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);

  let offset = 0;
  for (const geometry of prepared) {
    const p = geometry.getAttribute('position') as BufferAttribute;
    const n = geometry.getAttribute('normal') as BufferAttribute | undefined;
    const t = geometry.getAttribute('uv') as BufferAttribute | undefined;
    position.set(p.array as Float32Array, offset * 3);
    if (n) normal.set(n.array as Float32Array, offset * 3);
    if (t) uv.set(t.array as Float32Array, offset * 2);
    offset += p.count;
    geometry.dispose();
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Convenience: build a merged mesh-ready geometry from a unit sphere scaled into a blob. */
export function blob(geometry: BufferGeometry, scale: [number, number, number], position: [number, number, number]): GeometryPart {
  return { geometry, scale, position };
}
