// The T-Rex's heavy ranged attack: a lobbed ball of fire that bursts on impact.
import * as THREE from 'three';
import { FIREBALL, WORLD } from './config.js';

export class Fireball {
  /** `velocity` is the full launch velocity, already solved for the arc. */
  constructor(scene, origin, velocity) {
    this.scene = scene;
    this.pos = origin.clone();
    this.vel = velocity.clone();
    this.life = FIREBALL.life;
    this.dead = false;
    this.spin = Math.random() * Math.PI;

    const g = new THREE.Group();
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
    g.position.copy(this.pos);
    scene.add(g);
    this.mesh = g;

    this.light = new THREE.PointLight(0xffa43c, 14, 26, 2);
    g.add(this.light);
  }

  /** Steps the arc; returns a hit description when it goes off. */
  update(dt, rhinos, world) {
    if (this.dead) return null;
    this.life -= dt;
    this.vel.y += FIREBALL.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.spin += dt * 9;
    this.core.rotation.set(this.spin, this.spin * 0.7, 0);
    this.shell.rotation.set(-this.spin * 0.6, this.spin * 0.4, 0);
    this.shell.scale.setScalar(1 + Math.sin(this.spin * 3) * 0.08);
    this.light.intensity = 12 + Math.sin(this.spin * 5) * 4;

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
