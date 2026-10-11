import {
  BoxGeometry,
  DoubleSide,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  ConeGeometry,
  Object3D,
} from 'three';
import { TAU } from '../core/mathx.ts';

const COLORS = {
  wood: 0xc8916a,
  woodDark: 0xa06f4f,
  cream: 0xf7ecdd,
  sage: 0xa9c1a5,
  blush: 0xe9a9a2,
  sky: 0xa9c2dc,
  yarn: [0xf2a9b8, 0x9fc7e8, 0xf5d58f, 0xb6d6a4, 0xcbb3ec] as const,
  leaf: 0x86ab7c,
};

function solid(color: number, roughness = 0.9): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function add(
  parent: Object3D,
  geometry: BoxGeometry | CylinderGeometry | SphereGeometry | TorusGeometry | ConeGeometry,
  material: MeshStandardMaterial,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Cozy furniture scattered around the edge of the rug: a cat tower, a
 * tunnel, cushions, a plant and a basket of yarn.
 */
export class Props {
  readonly group = new Group();
  /** Simple circular obstacles that cats steer around. */
  readonly obstacles: { x: number; z: number; radius: number }[] = [];

  private readonly dangle = new Group();
  private danglePhase = 0;

  constructor(rugRadius: number) {
    const sphere = new SphereGeometry(1, 20, 14);
    const cylinder = new CylinderGeometry(1, 1, 1, 20);
    const box = new BoxGeometry(1, 1, 1);
    const cone = new ConeGeometry(1, 1, 16);
    const torus = new TorusGeometry(1, 0.32, 12, 24);

    /* ── cat tower ───────────────────────────────────────────────── */
    const tower = new Group();
    tower.position.set(-rugRadius * 0.68, 0, -rugRadius * 0.6);
    tower.rotation.y = 0.5;

    add(tower, cylinder, solid(COLORS.cream), [0, 0.09, 0], [0.95, 0.18, 0.95]);
    add(tower, cylinder, solid(COLORS.wood), [0, 0.85, 0], [0.15, 1.4, 0.15]);
    add(tower, cylinder, solid(COLORS.blush), [0, 1.62, 0], [0.66, 0.16, 0.66]);
    add(tower, cylinder, solid(COLORS.wood), [0.42, 2.1, 0.1], [0.12, 0.8, 0.12]);
    add(tower, cylinder, solid(COLORS.sage), [0.42, 2.54, 0.1], [0.46, 0.14, 0.46]);
    // cosy hidey-hole on the base
    add(tower, sphere, solid(COLORS.cream), [-0.5, 0.42, 0.42], [0.42, 0.42, 0.42]);
    add(tower, sphere, solid(0x6f5a4c), [-0.62, 0.36, 0.66], [0.2, 0.2, 0.1]);

    // dangling pom-pom toy
    this.dangle.position.set(0.42, 2.46, 0.1);
    const cord = add(this.dangle, cylinder, solid(COLORS.cream, 0.7), [0, -0.28, 0], [0.012, 0.56, 0.012]);
    cord.castShadow = false;
    const pom = add(this.dangle, sphere, solid(COLORS.yarn[0]), [0, -0.62, 0], [0.11, 0.11, 0.11]);
    pom.castShadow = false;
    tower.add(this.dangle);
    this.group.add(tower);
    this.obstacles.push({ x: tower.position.x, z: tower.position.z, radius: 1.1 });

    /* ── play tunnel ─────────────────────────────────────────────── */
    const tunnel = new Group();
    tunnel.position.set(rugRadius * 0.66, 0, -rugRadius * 0.55);
    tunnel.rotation.y = -0.9;

    // A full open tube lying on its side reads as a play tunnel from every angle.
    const tunnelMaterial = solid(COLORS.blush, 0.85);
    tunnelMaterial.side = DoubleSide;
    const shell = new Mesh(new CylinderGeometry(0.68, 0.68, 1.7, 26, 1, true), tunnelMaterial);
    shell.rotation.z = Math.PI / 2;
    shell.position.y = 0.68;
    shell.castShadow = true;
    shell.receiveShadow = true;
    tunnel.add(shell);
    add(tunnel, torus, solid(COLORS.cream), [-0.86, 0.68, 0], [0.68, 0.68, 0.68], [0, Math.PI / 2, 0]);
    add(tunnel, torus, solid(COLORS.cream), [0.86, 0.68, 0], [0.68, 0.68, 0.68], [0, Math.PI / 2, 0]);
    this.group.add(tunnel);
    this.obstacles.push({ x: tunnel.position.x, z: tunnel.position.z, radius: 1.0 });

    /* ── cushions ────────────────────────────────────────────────── */
    const cushionSpots: [number, number, number, number][] = [
      [rugRadius * 0.72, rugRadius * 0.42, 0.58, 0.4],
      [-rugRadius * 0.6, rugRadius * 0.66, 0.48, -0.6],
      [rugRadius * 0.1, -rugRadius * 0.82, 0.52, 1.2],
    ];
    const cushionColors = [COLORS.sage, COLORS.sky, COLORS.blush];
    cushionSpots.forEach(([x, z, radius, rotation], index) => {
      const cushion = new Mesh(sphere, solid(cushionColors[index % cushionColors.length], 0.95));
      cushion.position.set(x, 0.14, z);
      cushion.scale.set(radius, 0.17, radius * 0.86);
      cushion.rotation.y = rotation;
      cushion.castShadow = true;
      cushion.receiveShadow = true;
      this.group.add(cushion);
    });

    /* ── yarn basket ─────────────────────────────────────────────── */
    const basket = new Group();
    basket.position.set(-rugRadius * 0.72, 0, rugRadius * 0.55);
    const basketMaterial = solid(0xcbb08c, 0.95);
    basketMaterial.side = DoubleSide;
    const basketShell = new Mesh(new CylinderGeometry(0.52, 0.4, 0.44, 20, 1, true), basketMaterial);
    basketShell.position.y = 0.22;
    basketShell.castShadow = true;
    basket.add(basketShell);
    add(basket, cylinder, solid(COLORS.woodDark), [0, 0.02, 0], [0.42, 0.05, 0.42]);

    const yarnRng = (() => {
      let seed = 8;
      return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
    })();
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * TAU + yarnRng();
      const radius = 0.24 + yarnRng() * 0.1;
      const ball = new Mesh(sphere, solid(COLORS.yarn[i % COLORS.yarn.length], 0.98));
      ball.position.set(Math.cos(angle) * radius, 0.38 + yarnRng() * 0.06, Math.sin(angle) * radius);
      ball.scale.setScalar(0.2 + yarnRng() * 0.05);
      ball.castShadow = true;
      basket.add(ball);
    }
    this.group.add(basket);
    this.obstacles.push({ x: basket.position.x, z: basket.position.z, radius: 0.7 });

    /* ── potted plant ────────────────────────────────────────────── */
    const plant = new Group();
    plant.position.set(rugRadius * 0.78, 0, rugRadius * 0.72);
    add(plant, new CylinderGeometry(0.44, 0.32, 0.6, 18), solid(0xd5a281), [0, 0.3, 0]);
    add(plant, cylinder, solid(COLORS.woodDark), [0, 0.6, 0], [0.46, 0.06, 0.46]);
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * TAU;
      const blade = add(
        plant,
        cone,
        solid(COLORS.leaf, 0.85),
        [Math.cos(angle) * 0.12, 0.86, Math.sin(angle) * 0.12],
        [0.07, 0.34, 0.045],
        [0, 0, 0],
      );
      blade.rotation.z = Math.cos(angle) * 0.45;
      blade.rotation.x = -Math.sin(angle) * 0.45;
    }
    this.group.add(plant);
    this.obstacles.push({ x: plant.position.x, z: plant.position.z, radius: 0.6 });

    /* ── a lone cardboard box, because cats ──────────────────────── */
    const boxProp = new Group();
    boxProp.position.set(rugRadius * 0.3, 0, rugRadius * 0.9);
    boxProp.rotation.y = -0.35;
    add(boxProp, box, solid(0xbf9769, 0.95), [0, 0.28, 0], [0.72, 0.56, 0.62]);
    add(boxProp, box, solid(0xa8814f, 0.95), [0, 0.55, -0.31], [0.72, 0.05, 0.05], [0.25, 0, 0]);
    add(boxProp, box, solid(0xa8814f, 0.95), [0, 0.55, 0.31], [0.72, 0.05, 0.05], [-0.25, 0, 0]);
    this.group.add(boxProp);
    this.obstacles.push({ x: boxProp.position.x, z: boxProp.position.z, radius: 0.55 });
  }

  update(dt: number): void {
    this.danglePhase += dt * 1.1;
    this.dangle.rotation.x = Math.sin(this.danglePhase) * 0.28;
    this.dangle.rotation.z = Math.cos(this.danglePhase * 0.7) * 0.22;
  }
}
