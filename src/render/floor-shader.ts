/**
 * The corridor floor as a fragment shader. For every pixel below the horizon it undoes the camera's perspective
 * projection (screen y → depth z, screen x → lane position l) and colours the pixel from (l, z): road, hazard tape,
 * lane dashes. Stripes are box-filtered with derivatives, so they stay anti-aliased all the way to the horizon, and
 * the CPU does no per-frame work beyond setting two numbers.
 *
 * The maths mirrors Camera.project in camera.ts: s = D / (D + z),  y = hy + (by - hy)·s,  x = W/2 + (l - camX)·lw·s.
 */
export const FLOOR_VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aPosition;
}
`;

export const FLOOR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 finalColor;

uniform float uW;
uniform float uH;
uniform float uHy;
uniform float uBy;
uniform float uLw;
uniform float uCamX;
uniform float uDist4;   // distance travelled, mod 4 (the stripe patterns repeat every 2 and 4 m)

const float D = 6.0;
const float ZMAX = 72.0;

// share of the window [x - w/2, x + w/2] that lies inside [a, b]
float cover(float x, float a, float b, float w) {
  float lo = max(a, x - 0.5 * w);
  float hi = min(b, x + 0.5 * w);
  return clamp((hi - lo) / max(w, 1e-5), 0.0, 1.0);
}

// share of the window that is "on" in a square wave: on for the first duty*period of every period
float pulse(float x, float period, float duty, float w) {
  float p = x / period;
  float dw = max(w / period, 1e-4);
  float a = p + 0.5 * dw;
  float b = p - 0.5 * dw;
  float fa = floor(a) * duty + min(fract(a), duty);
  float fb = floor(b) * duty + min(fract(b), duty);
  return clamp((fa - fb) / dw, 0.0, 1.0);
}

void main() {
  float x = vUV.x * uW;
  float y = uHy + vUV.y * (uH - uHy);
  float s = max((y - uHy) / (uBy - uHy), 1e-4);
  float z = D / s - D;
  float l = (x - 0.5 * uW) / (uLw * s) + uCamX;
  float al = abs(l);
  float wl = fwidth(l);
  float wz = fwidth(z);

  vec3 ground = vec3(0.2392, 0.2549, 0.2824);                       // #3d4148
  vec3 road = mix(vec3(0.3333, 0.3490, 0.3725), vec3(0.6078, 0.6235, 0.6471), vUV.y); // #55595f -> #9b9fa5
  vec3 black = vec3(0.1020);
  vec3 yellow = vec3(1.0, 0.8314, 0.0);

  float inRange = step(-3.0, z) * (1.0 - step(ZMAX, z));
  float tape = cover(al, 1.5, 1.66, wl) * inRange;
  float roadA = cover(l, -1.5, 1.5, wl) * inRange;   // signed l: abs() would dent the coverage along the centre line
  float dash = cover(al, 0.47, 0.53, wl) * pulse(z + uDist4, 4.0, 0.45, wz) * inRange;
  float tapeYellow = tape * pulse(z + uDist4, 2.0, 0.5, wz);

  vec3 col = mix(ground, road, roadA);
  col = mix(col, black, tape);
  col = mix(col, yellow, tapeYellow);
  col = mix(col, yellow, dash * 0.85);
  finalColor = vec4(col, 1.0);
}
`;

/** True if this device's GLSL compiler accepts the floor shader. Checked up front so we can fall back instead of drawing a black floor. */
export function floorShaderCompiles(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ok = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      return !!gl.getShaderParameter(sh, gl.COMPILE_STATUS);
    };
    const good = ok(gl.VERTEX_SHADER, FLOOR_VERTEX) && ok(gl.FRAGMENT_SHADER, FLOOR_FRAGMENT);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return good;
  } catch { return false; }
}
