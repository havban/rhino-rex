// The T-Rex's heavy ranged attack: a lobbed ball of fire that bursts on impact.
import * as THREE from 'three';
import { FIREBALL, WORLD, ITEMS } from './config.js';

export class Fireball {
  /**
   * `velocity` is the full launch velocity, already solved for the arc.
   * `kind` is 'fire' for the cannon or 'dinamit' for the thrown stick, which
   * flies the same way but burns a fuse instead of needing a direct hit.
   */
  constructor(scene, origin, velocity, kind = 'fire') {
    this.scene = scene;
    this.kind = kind;
    this.pos = origin.clone();
    this.vel = velocity.clone();
    this.dead = false;
    this.spin = Math.random() * Math.PI;

    const g = new THREE.Group();
    if (kind === 'dinamit') {
      const cfg = ITEMS.kinds.dinamit;
      this.life = cfg.fuse;
      this.gravity = cfg.gravity;
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: 0xc0392b })
      );
      stick.rotation.z = Math.PI / 2;
      g.add(stick);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.22, 8),
        new THREE.MeshLambertMaterial({ color: 0x3b2a20 })
      );
      band.rotation.z = Math.PI / 2;
      g.add(band);
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0 })
      );
      spark.position.x = 0.62;
      g.add(spark);
      this.core = stick;
      this.shell = spark;
      this.light = new THREE.PointLight(0xffd070, 6, 14, 2);
    } else {
      this.life = FIREBALL.life;
      this.gravity = FIREBALL.gravity;
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(FIREBALL.radius, 1),
        new THREE.MeshBasicMaterial({ color: 0xfff0b0 })
      );
      g.add(core);
      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(FIREBALL.radius * 1.55, 1),
        new THREE.MeshBasicMaterial({ color: 0xff6a12, transparent: true, opacity: 0.55, depthWrite: false })
      );
      g.add(shell);
      this.core = core;
      this.shell = shell;
      this.light = new THREE.PointLight(0xffa43c, 14, 26, 2);
    }
    g.position.copy(this.pos);
    scene.add(g);
    this.mesh = g;
    g.add(this.light);
  }

  /** Steps the arc; returns a hit description when it goes off. */
  update(dt, rhinos, world) {
    if (this.dead) return null;
    this.life -= dt;
    this.vel.y += this.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.spin += dt * 9;
    if (this.kind === 'dinamit') {
      this.mesh.rotation.z += dt * 7;                 // tumbles end over end
      const flicker = 0.7 + Math.random() * 0.6;
      this.shell.scale.setScalar(flicker);
      this.light.intensity = 5 * flicker;
      if (this.life <= 0) return { direct: null, pos: this.pos.clone() };   // fuse burns out
    } else {
      this.core.rotation.set(this.spin, this.spin * 0.7, 0);
      this.shell.rotation.set(-this.spin * 0.6, this.spin * 0.4, 0);
      this.shell.scale.setScalar(1 + Math.sin(this.spin * 3) * 0.08);
      this.light.intensity = 12 + Math.sin(this.spin * 5) * 4;
    }

    for (const r of rhinos) {
      if (!r.alive) continue;
      const dx = r.pos.x - this.pos.x, dz = r.pos.z - this.pos.z;
      const dy = (1.6 * r.scaleF) - this.pos.y;
      const reach = r.radius + FIREBALL.radius;
      if (dx * dx + dz * dz < reach * reach && Math.abs(dy) < 2.4 * r.scaleF) {
        return { direct: r, pos: this.pos.clone() };
      }
    }

    if (this.pos.y <= 0.4) return { direct: null, pos: this.pos.clone().setY(0.3) };
    if (Math.hypot(this.pos.x, this.pos.z) > WORLD.radius + 8 || this.life <= 0) {
      return { direct: null, pos: this.pos.clone(), fizzle: true };
    }
    const hit = world.obstacles.find((o) => {
      if (!o.solid) return false;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      return dx * dx + dz * dz < (o.radius + FIREBALL.radius) ** 2 && this.pos.y < 6;
    });
    if (hit) return { direct: null, pos: this.pos.clone() };
    return null;
  }

  dispose() {
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
