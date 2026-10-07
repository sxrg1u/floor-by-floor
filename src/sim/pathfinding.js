// Grid pathfinding per floor. On a uniform-cost 4-way grid a breadth-first search returns the same
// shortest paths as A*, and one search from the agent serves every candidate target at once.
import { MAP_W, MAP_H } from '../config.js';
import { DATA } from '../data.js';
import { flc } from '../systems/building.js';

const N = MAP_W * MAP_H;

export function walkable(g, floor, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  const fl = g.floors[floor];
  if (!fl) return false;
  const t = fl.tiles[y][x];
  if (t !== '.' && t !== 'D') return false;
  const o = flc(g, floor).occ[y * MAP_W + x];
  if (!o) return true;
  const f = g.furnById[o];
  return !!(f && DATA.furnById[f.type].walkable);
}

export function bfs(g, floor, sx, sy) {
  sx = Math.max(0, Math.min(MAP_W - 1, sx));
  sy = Math.max(0, Math.min(MAP_H - 1, sy));
  const dist = new Int16Array(N).fill(-1);
  const prev = new Int32Array(N);
  const queue = new Int32Array(N);
  const s = sy * MAP_W + sx;
  let head = 0, tail = 0;
  dist[s] = 0; prev[s] = -1; queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (dist[ni] >= 0 || !walkable(g, floor, nx, ny)) continue;
      dist[ni] = dist[i] + 1; prev[ni] = i; queue[tail++] = ni;
    }
  }
  return { dist, prev, start: s, floor };
}

export function distTo(res, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
  return res.dist[y * MAP_W + x];
}

// Path as a list of tiles, excluding the start tile. null if unreachable.
export function pathFrom(res, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
  let i = ty * MAP_W + tx;
  if (res.dist[i] < 0) return null;
  const out = [];
  while (i !== res.start) { out.push({ x: i % MAP_W, y: (i / MAP_W) | 0 }); i = res.prev[i]; }
  return out.reverse();
}
