/**
 * A mine you drop and walk away from.
 *
 * It arms after a moment (so you cannot drop one under a rhino already on
 * top of you), then waits for something to come close. The counter to a
 * charging rhino: it commits to a straight line, and a mine punishes that.
 */
import * as THREE from 'three';
import { ITEMS } from './config.js';

const CFG = ITEMS.kinds.ranjau;

export class Mine {
  constructor(scene, pos) {
    this.scene = scene;
    this.pos = pos.clone().setY(0);
    this.age = 0;
    this.dead = false;

    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.95, 0.42, 12),
      new THREE.MeshLambertMaterial({ color: 0x3f4750, flatShading: true })
    );
    body.position.y = 0.21;
    body.castShadow = true;
    g.add(body);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.34, 5),
        new THREE.MeshLambertMaterial({ color: 0x2a3138 })
      );
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.62, 0.42, Math.sin(a) * 0.62);
      spike.rotation.z = -Math.cos(a) * 0.4;
      spike.rotation.x = Math.sin(a) * 0.4;
      g.add(spike);
    }
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f })
    );
    lamp.position.y = 0.52;
    g.add(lamp);
    this.lamp = lamp;

    g.position.copy(this.pos);
    scene.add(g);
    this.mesh = g;
  }

  get armed() { return this.age >= CFG.arm; }

  /** Returns true on the frame it should detonate. */
  update(dt, rhinos) {
    if (this.dead) return false;
    this.age += dt;

    // blinks slowly while arming, fast once live, so you can read it at a glance
    const rate = this.armed ? 6 : 2;
    const on = Math.sin(this.age * rate * Math.PI) > -0.2;
    this.lamp.material.color.setHex(this.armed ? (on ? 0xff2b1d : 0x551008) : (on ? 0xffc23d : 0x5a4415));
    this.mesh.position.y = this.armed ? Math.sin(this.age * 5) * 0.03 : 0;

    if (this.age > CFG.life) return true;          // times out with a bang
    if (!this.armed) return false;
    for (const r of rhinos) {
      if (!r.alive) continue;
      const d = Math.hypot(r.pos.x - this.pos.x, r.pos.z - this.pos.z) - r.radius;
      if (d < CFG.trigger) return true;
    }
    return false;
  }

  dispose() {
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
