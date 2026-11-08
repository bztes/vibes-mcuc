import { strToU8, zipSync } from 'fflate';
import type { MeshData } from './case/types';

export interface PrintPart {
	name: string;
	mesh: MeshData;
}

function bounds(positions: Float32Array) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k], positions[i + k]);
			max[k] = Math.max(max[k], positions[i + k]);
		}
	}
	return { min, max };
}

function transform(
	mesh: MeshData,
	fn: (x: number, y: number, z: number) => [number, number, number]
): MeshData {
	const out = new Float32Array(mesh.positions.length);
	for (let i = 0; i < out.length; i += 3) {
		const [x, y, z] = fn(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
		out[i] = x;
		out[i + 1] = y;
		out[i + 2] = z;
	}
	return { positions: out, indices: mesh.indices };
}

/**
 * Orients the parts for printing and puts them in a row on one plate:
 * layers upright, the lid flipped (rotated 180° about X, which keeps the winding valid)
 * so its plate lies on the bed.
 */
export function printLayout(layers: MeshData[], lid: MeshData, gap = 10): PrintPart[] {
	const parts: PrintPart[] = [];
	let x = 0;
	const place = (mesh: MeshData, name: string) => {
		const b = bounds(mesh.positions);
		const dx = x - b.min[0];
		parts.push({ name, mesh: transform(mesh, (px, py, pz) => [px + dx, py, pz - b.min[2]]) });
		x += b.max[0] - b.min[0] + gap;
	};
	layers.forEach((m, i) => place(m, i === 0 ? 'base' : `layer ${i + 1}`));
	place(
		transform(lid, (px, py, pz) => [px, -py, -pz]),
		'lid'
	);
	// centre the row on the origin
	const shift = (x - gap) / 2;
	return parts.map((p) => ({
		...p,
		mesh: transform(p.mesh, (px, py, pz) => [px - shift, py, pz])
	}));
}

export function toBinaryStl(mesh: MeshData, name = 'case'): Uint8Array {
	const triCount = mesh.indices.length / 3;
	const buffer = new ArrayBuffer(84 + triCount * 50);
	const view = new DataView(buffer);
	const header = `ESP stack designer: ${name}`.slice(0, 79);
	for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
	view.setUint32(80, triCount, true);
	const p = mesh.positions;
	let o = 84;
	for (let t = 0; t < triCount; t++) {
		const a = mesh.indices[t * 3] * 3;
		const b = mesh.indices[t * 3 + 1] * 3;
		const c = mesh.indices[t * 3 + 2] * 3;
		const ux = p[b] - p[a];
		const uy = p[b + 1] - p[a + 1];
		const uz = p[b + 2] - p[a + 2];
		const vx = p[c] - p[a];
		const vy = p[c + 1] - p[a + 1];
		const vz = p[c + 2] - p[a + 2];
		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		nx /= len;
		ny /= len;
		nz /= len;
		view.setFloat32(o, nx, true);
		view.setFloat32(o + 4, ny, true);
		view.setFloat32(o + 8, nz, true);
		o += 12;
		for (const idx of [a, b, c]) {
			view.setFloat32(o, p[idx], true);
			view.setFloat32(o + 4, p[idx + 1], true);
			view.setFloat32(o + 8, p[idx + 2], true);
			o += 12;
		}
		view.setUint16(o, 0, true);
		o += 2;
	}
	return new Uint8Array(buffer);
}

const escapeXml = (s: string) =>
	s.replace(
		/[<>&"']/g,
		(c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!
	);

/** 3MF package with one object per part, all on the same build plate. */
export function to3mf(parts: PrintPart[], title = 'case'): Uint8Array {
	const fmt = (n: number) => (Math.round(n * 10000) / 10000).toString();
	const objects: string[] = [];
	const items: string[] = [];
	parts.forEach((part, i) => {
		const id = i + 1;
		const v: string[] = [];
		const p = part.mesh.positions;
		for (let k = 0; k < p.length; k += 3) {
			v.push(`<vertex x="${fmt(p[k])}" y="${fmt(p[k + 1])}" z="${fmt(p[k + 2])}"/>`);
		}
		const tr: string[] = [];
		const ix = part.mesh.indices;
		for (let k = 0; k < ix.length; k += 3) {
			tr.push(`<triangle v1="${ix[k]}" v2="${ix[k + 1]}" v3="${ix[k + 2]}"/>`);
		}
		objects.push(
			`<object id="${id}" name="${escapeXml(`${title} – ${part.name}`)}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${tr.join('')}</triangles></mesh></object>`
		);
		items.push(`<item objectid="${id}"/>`);
	});

	const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${escapeXml(title)}</metadata>
<metadata name="Application">ESP Case Designer</metadata>
<resources>${objects.join('\n')}</resources>
<build>${items.join('')}</build>
</model>`;

	const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

	const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

	return zipSync(
		{
			'[Content_Types].xml': strToU8(contentTypes),
			'_rels/.rels': strToU8(rels),
			'3D/3dmodel.model': strToU8(model)
		},
		{ level: 6 }
	);
}

export function download(data: Uint8Array, filename: string, mime: string) {
	const blob = new Blob([data as BlobPart], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(name: string) {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'case'
	);
}
