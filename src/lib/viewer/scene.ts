import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CaseLayout, MeshData, ResolvedBoard } from '#lib/stack/case/types.js';
import { PIN_HEADER, pinPositions } from '#lib/stack/parts.js';
import { printLayout } from '#lib/stack/export.js';

export type SceneMode = 'layer' | 'stack' | 'print';

export interface SceneInput {
	layout: CaseLayout;
	meshes: { layers: MeshData[]; lid: MeshData } | null;
	mode: SceneMode;
	/** Shown layer in "layer" mode, -1 = lid. */
	index: number;
	/** 0 = closed, 1 = fully exploded. */
	explode: number;
	selectedBoard: string | null;
	/** false = case only. */
	showBoards: boolean;
	/** true = see-through case walls. */
	transparent: boolean;
}

const LAYER_COLORS = [0xe9e6df, 0xd9e2ec];
const LID_COLOR = 0x6fc2b8;
const CASE_OPACITY = 0.25;
const EDGE_OPACITY = 0.3;
const CASE_EDGE_OPACITY_TRANSPARENT = 0.6;

export class StackScene {
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	container: HTMLElement;
	onPick: ((uid: string | null) => void) | null = null;

	#content = new THREE.Group();
	#boards = new THREE.Group();
	#geoCache = new Map<MeshData, THREE.BufferGeometry>();
	#used = new Set<MeshData>();
	#mats = LAYER_COLORS.map((c) => this.#material(c));
	#lidMat = this.#material(LID_COLOR);
	#edgeMat = new THREE.LineBasicMaterial({
		color: 0x3f3f46,
		transparent: true,
		opacity: EDGE_OPACITY
	});
	#transparent = false;
	#raf = 0;
	#ro: ResizeObserver;
	#fitKey = '';
	#print: { key: MeshData[]; parts: MeshData[] } | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		container.appendChild(this.renderer.domElement);
		this.renderer.domElement.style.display = 'block';

		this.camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
		this.camera.up.set(0, 0, 1);
		this.camera.position.set(120, -160, 120);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.12;
		this.controls.addEventListener('change', () => this.render());

		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.6));
		const key = new THREE.DirectionalLight(0xffffff, 1.6);
		key.position.set(80, -120, 200);
		const fill = new THREE.DirectionalLight(0xffffff, 0.6);
		fill.position.set(-150, 100, 60);
		this.scene.add(key, fill);
		const grid = new THREE.GridHelper(400, 40, 0xc4c4cc, 0xe0e0e6);
		grid.rotateX(Math.PI / 2);
		grid.position.z = -0.05;
		this.scene.add(grid, this.#content, this.#boards);

		this.#ro = new ResizeObserver(() => this.resize());
		this.#ro.observe(container);
		this.resize();

		let down: { x: number; y: number } | null = null;
		const el = this.renderer.domElement;
		el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
		el.addEventListener('pointerup', (e) => {
			if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
			down = null;
			this.#pick(e);
		});

		const loop = () => {
			this.#raf = requestAnimationFrame(loop);
			this.controls.update();
		};
		loop();
	}

	#material(color: number) {
		return new THREE.MeshStandardMaterial({
			color,
			roughness: 0.65,
			metalness: 0,
			side: THREE.DoubleSide
		});
	}

	resize() {
		const w = this.container.clientWidth || 1;
		const h = this.container.clientHeight || 1;
		this.renderer.setSize(w, h);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.render();
	}

	render() {
		this.renderer.render(this.scene, this.camera);
	}

	update(input: SceneInput) {
		this.#clear(this.#content, false);
		this.#clear(this.#boards, true);
		this.#used.clear();
		const { layout, meshes, mode } = input;
		const gap = 6 + input.explode * 30;
		this.#boards.visible = input.showBoards;
		this.#setTransparent(input.transparent && mode !== 'print');

		if (mode === 'print') {
			if (meshes) this.#addPrint(meshes);
		} else if (mode === 'layer') {
			if (input.index < 0) {
				if (meshes) this.#addMesh(this.#content, meshes.lid, this.#lidMat, 0);
			} else {
				if (meshes?.layers[input.index])
					this.#addMesh(this.#content, meshes.layers[input.index], this.#mats[input.index % 2], 0);
				const l = layout.layers[input.index];
				if (l)
					for (const b of l.boards)
						this.#boards.add(this.#board(b, 0, b.board.uid === input.selectedBoard));
			}
		} else {
			let z = 0;
			layout.layers.forEach((l, i) => {
				if (meshes?.layers[i]) this.#addMesh(this.#content, meshes.layers[i], this.#mats[i % 2], z);
				for (const b of l.boards)
					this.#boards.add(this.#board(b, z, b.board.uid === input.selectedBoard));
				z += l.height - layout.seam.overlap + (input.explode > 0 ? gap : 0);
			});
			if (meshes) this.#addMesh(this.#content, meshes.lid, this.#lidMat, z);
		}

		// free GPU memory of meshes that are gone
		for (const [k, g] of this.#geoCache) {
			if (this.#used.has(k)) continue;
			(g.userData.edges as THREE.BufferGeometry).dispose();
			g.dispose();
			this.#geoCache.delete(k);
		}

		const fitKey = `${mode}:${input.index}:${Math.round(layout.inner.length)}x${Math.round(layout.inner.width)}`;
		if (fitKey !== this.#fitKey && this.#content.children.length) {
			this.#fitKey = fitKey;
			this.fit();
		}
		this.render();
	}

	fit() {
		const box = new THREE.Box3().setFromObject(this.#content);
		if (this.#boards.visible) box.union(new THREE.Box3().setFromObject(this.#boards));
		if (box.isEmpty()) return;
		const sphere = box.getBoundingSphere(new THREE.Sphere());
		const vfov = (this.camera.fov * Math.PI) / 180;
		const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
		const dist = (sphere.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05;
		this.controls.target.copy(sphere.center);
		const dir = new THREE.Vector3(0.55, -0.75, 0.6).normalize();
		this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
		this.camera.near = Math.max(0.5, dist / 100);
		this.camera.far = dist * 20;
		this.camera.updateProjectionMatrix();
		this.controls.update();
		this.render();
	}

	destroy() {
		cancelAnimationFrame(this.#raf);
		this.#ro.disconnect();
		this.controls.dispose();
		this.#clear(this.#content, false);
		this.#clear(this.#boards, true);
		for (const g of this.#geoCache.values()) {
			(g.userData.edges as THREE.BufferGeometry).dispose();
			g.dispose();
		}
		for (const m of [...this.#mats, this.#lidMat, this.#edgeMat]) m.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	// ── internals ──────────────────────────────────────────────────────
	#setTransparent(on: boolean) {
		if (on === this.#transparent) return;
		this.#transparent = on;
		for (const m of [...this.#mats, this.#lidMat]) {
			m.transparent = on;
			m.opacity = on ? CASE_OPACITY : 1;
			// no depth writes, otherwise near walls hide the far walls and boards behind them
			m.depthWrite = !on;
			m.needsUpdate = true; // the shader differs between opaque and blended
		}
		this.#edgeMat.opacity = on ? CASE_EDGE_OPACITY_TRANSPARENT : EDGE_OPACITY;
		this.#edgeMat.depthWrite = !on;
	}

	#geometry(mesh: MeshData) {
		this.#used.add(mesh);
		let g = this.#geoCache.get(mesh);
		if (!g) {
			const indexed = new THREE.BufferGeometry();
			indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
			indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
			g = indexed.toNonIndexed();
			g.computeVertexNormals();
			indexed.dispose();
			g.userData.edges = new THREE.EdgesGeometry(g, 35);
			this.#geoCache.set(mesh, g);
		}
		return g;
	}

	#addMesh(group: THREE.Group, data: MeshData, mat: THREE.Material, z: number) {
		const geo = this.#geometry(data);
		const m = new THREE.Mesh(geo, mat);
		const e = new THREE.LineSegments(geo.userData.edges as THREE.BufferGeometry, this.#edgeMat);
		m.position.z = z;
		e.position.z = z;
		group.add(m, e);
	}

	#addPrint(meshes: { layers: MeshData[]; lid: MeshData }) {
		const key = [...meshes.layers, meshes.lid];
		const cached = this.#print;
		const parts =
			cached && cached.key.length === key.length && cached.key.every((m, i) => m === key[i])
				? cached.parts
				: printLayout(meshes.layers, meshes.lid).map((p) => p.mesh);
		this.#print = { key, parts };
		parts.forEach((m, i) =>
			this.#addMesh(this.#content, m, i === parts.length - 1 ? this.#lidMat : this.#mats[i % 2], 0)
		);
	}

	#board(b: ResolvedBoard, z: number, selected: boolean) {
		const g = new THREE.Group();
		g.userData.uid = b.board.uid;
		const def = b.def;
		const pcbMat = new THREE.MeshStandardMaterial({
			color: new THREE.Color(def.color || '#1f7a4d'),
			roughness: 0.5,
			emissive: new THREE.Color(selected ? 0x0ea5a0 : 0),
			emissiveIntensity: selected ? 0.35 : 0
		});
		const bodyMat = new THREE.MeshStandardMaterial({
			color: selected ? 0x2dd4bf : 0x9ca3af,
			transparent: true,
			opacity: selected ? 0.35 : 0.22,
			depthWrite: false
		});
		const inner = new THREE.Group();
		inner.position.set(b.cx, b.cy, z);
		inner.rotation.z = (b.rotation * Math.PI) / 180;
		g.add(inner);

		const pcb = new THREE.Mesh(new THREE.BoxGeometry(def.length, def.width, def.thickness), pcbMat);
		pcb.position.z = b.zPcb + def.thickness / 2;
		inner.add(pcb);
		if (def.topHeight > 0.2) {
			const body = new THREE.Mesh(
				new THREE.BoxGeometry(def.length * 0.92, def.width * 0.92, def.topHeight),
				bodyMat
			);
			body.position.z = b.zPcbTop + def.topHeight / 2;
			inner.add(body);
		}
		if (def.bottomHeight > 0.2) {
			const under = new THREE.Mesh(
				new THREE.BoxGeometry(def.length * 0.85, def.width * 0.85, def.bottomHeight),
				bodyMat
			);
			under.position.z = b.zPcb - def.bottomHeight / 2;
			inner.add(under);
		}
		if (b.pinSide !== 'none') {
			const { long, tail } = PIN_HEADER;
			const down = b.pinSide === 'bottom';
			const z0 = b.zPcb - (down ? long : tail);
			const z1 = b.zPcbTop + (down ? tail : long);
			const points = pinPositions(def);
			const pins = new THREE.InstancedMesh(
				new THREE.BoxGeometry(0.64, 0.64, z1 - z0),
				new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.35 }),
				points.length
			);
			const m = new THREE.Matrix4();
			points.forEach(([x, y], i) => pins.setMatrixAt(i, m.makeTranslation(x, y, (z0 + z1) / 2)));
			inner.add(pins);
		}
		const portMat = new THREE.MeshStandardMaterial({
			color: 0xc0c4cc,
			metalness: 0.6,
			roughness: 0.3
		});
		for (const p of def.ports) {
			const w = p.width * 0.7;
			const h = p.height * 0.45;
			const d = 6;
			const sideways = p.side === 'left' || p.side === 'right';
			const m = new THREE.Mesh(
				new THREE.BoxGeometry(sideways ? d : w, sideways ? w : d, h),
				portMat
			);
			const pz = b.zPcbTop + p.z;
			if (p.side === 'left') m.position.set(-def.length / 2 + d / 2 - 1, p.offset, pz);
			if (p.side === 'right') m.position.set(def.length / 2 - d / 2 + 1, p.offset, pz);
			if (p.side === 'front') m.position.set(p.offset, -def.width / 2 + d / 2 - 1, pz);
			if (p.side === 'back') m.position.set(p.offset, def.width / 2 - d / 2 + 1, pz);
			inner.add(m);
		}
		return g;
	}

	#pick(e: PointerEvent) {
		const rect = this.renderer.domElement.getBoundingClientRect();
		const ndc = new THREE.Vector2(
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-((e.clientY - rect.top) / rect.height) * 2 + 1
		);
		const ray = new THREE.Raycaster();
		ray.setFromCamera(ndc, this.camera);
		const targets = this.#boards.visible ? [this.#boards] : [];
		for (const hit of ray.intersectObjects(targets, true)) {
			let o: THREE.Object3D | null = hit.object;
			while (o && !o.userData.uid) o = o.parent;
			if (o) return this.onPick?.(o.userData.uid as string);
		}
		this.onPick?.(null);
	}

	/** Board objects own their geometry and materials; layer meshes are cached and shared. */
	#clear(group: THREE.Group, dispose: boolean) {
		if (dispose)
			group.traverse((o) => {
				if (o instanceof THREE.Mesh) {
					o.geometry.dispose();
					(Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
				}
			});
		group.clear();
	}
}
