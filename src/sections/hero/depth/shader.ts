/** Full depth range x a unit shift moves a sample this far (UV). The picture is zoomed in by half of it on each side, so no sample leaves the texture. */
const STRENGTH = 0.025;

// One full-screen triangle from gl_VertexID, so there is no vertex buffer. v is 0..1 with y down, like the image rows.
const VERT = `#version 300 es
out vec2 v;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Near pixels (light in the depth map) move one way, far ones the other: (depth - 0.5) x shift.
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D photo;
uniform sampler2D depth;
uniform vec2 scale;
uniform vec2 offset;
uniform vec2 shift;
in vec2 v;
out vec4 color;
void main() {
  const float margin = ${STRENGTH / 2};
  vec2 uv = margin + (1.0 - 2.0 * margin) * (v * scale + offset);
  color = texture(photo, uv + (texture(depth, uv).r - 0.5) * shift * ${STRENGTH});
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function texture(gl: WebGL2RenderingContext, unit: number, format: number, internal: number, image: ImageBitmap) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [name, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, name, value);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, gl.UNSIGNED_BYTE, image);
}

/**
 * Uploads the photo and its depth map and returns a draw function. `focus` is the object-position as 0..1 fractions;
 * `shiftX`/`shiftY` is the pointer + scroll vector, each -1..1. Throws if the shaders do not build.
 */
export function createDepthProgram(gl: WebGL2RenderingContext, photo: ImageBitmap, depth: ImageBitmap, focus: [number, number]) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`depth shader: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  texture(gl, 0, gl.RGBA, gl.RGBA8, photo);
  texture(gl, 1, gl.RED, gl.R8, depth);
  gl.uniform1i(gl.getUniformLocation(program, "photo"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "depth"), 1);
  const [scale, offset, shift] = ["scale", "offset", "shift"].map((n) => gl.getUniformLocation(program, n));
  const aspect = photo.width / photo.height;

  return (width: number, height: number, shiftX: number, shiftY: number) => {
    // Cover fit, like object-fit: cover with object-position = focus.
    const box = width / height;
    const [sx, sy] = aspect > box ? [box / aspect, 1] : [1, aspect / box];
    gl.viewport(0, 0, width, height);
    gl.uniform2f(scale, sx, sy);
    gl.uniform2f(offset, (1 - sx) * focus[0], (1 - sy) * focus[1]);
    gl.uniform2f(shift, shiftX, shiftY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}
