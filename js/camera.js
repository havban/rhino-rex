// Third-person chase camera that rides behind the rex.
import * as THREE from 'three';
import { CAMERA } from './config.js';

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.12;
    this.pos = new THREE.Vector3(0, 10, 40);
    this.look = new THREE.Vector3();
    this.dist = CAMERA.distance;
    this._desired = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  handleLook(dx, dy, invertY = false) {
    this.yaw -= dx * CAMERA.sensitivity;
    this.pitch += (invertY ? -dy : dy) * CAMERA.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.pitchMin, CAMERA.pitchMax);
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  update(dt, rex, world, shake = 0, zoom = 1) {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const target = this._tmp.set(rex.pos.x, rex.y + CAMERA.lookHeight, rex.pos.z)
      .addScaledVector(fwd, CAMERA.lookAhead)
      .addScaledVector(right, CAMERA.shoulder);

    // where the camera wants to sit: behind the aim yaw, lifted by pitch
    const back = fwd.clone().negate();
    const dist = (CAMERA.distance + CAMERA.lookAhead) * zoom * (1 + Math.min(rex.speed / 40, 0.22));
    const height = CAMERA.height + this.pitch * 13;
    this._desired.copy(target).addScaledVector(back, dist * Math.cos(this.pitch * 0.6)).setY(rex.y + height);

    // Keep the camera out of scenery, but never crowd the rex: trees are
    // everywhere, so a hard pull-in would make the framing jump constantly.
    const d = this._desired.clone().sub(target);
    const len = d.length();
    d.divideScalar(len);
    let allowed = len;
    const minDist = CAMERA.minDistance;
    for (const o of world.obstacles) {
      if (!o.solid) continue;
      const ox = o.pos.x - target.x, oz = o.pos.z - target.z;
      const t = ox * d.x + oz * d.z;
      if (t < minDist || t > len) continue;               // behind us, or past the camera
      const px = ox - d.x * t, pz = oz - d.z * t;
      if (Math.hypot(px, pz) < o.radius + 0.8) allowed = Math.min(allowed, t - 0.8);
    }
    allowed = Math.max(allowed, minDist);
    // ease towards the allowed boom length: snap in, drift back out
    this.dist += (allowed - this.dist) * (1 - Math.exp(-(allowed < this.dist ? 18 : 2.5) * dt));
    this._desired.copy(target).addScaledVector(d, Math.min(this.dist, len));
    if (this._desired.y < 2.2) this._desired.y = 2.2;

    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    this.pos.lerp(this._desired, k);
    this.look.lerp(target, 1 - Math.exp(-14 * dt));

    this.camera.position.copy(this.pos);
    if (shake > 0) {
      const s = shake * 0.55;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.look);
    if (shake > 0) this.camera.rotateZ((Math.random() - 0.5) * shake * 0.03);
  }

  // Slow orbit used on the menu / game-over screens.
  orbit(dt, rex, t) {
    const r = 26;
    const a = t * 0.22;
    this.camera.position.set(rex.pos.x + Math.cos(a) * r, 11 + Math.sin(t * 0.4) * 2, rex.pos.z + Math.sin(a) * r);
    this.camera.lookAt(rex.pos.x, 3.2, rex.pos.z);
    this.yaw = Math.atan2(rex.pos.x - this.camera.position.x, rex.pos.z - this.camera.position.z);
  }
}
