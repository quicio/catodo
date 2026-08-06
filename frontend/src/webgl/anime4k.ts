// Anime4K WebGL2 engine — converts mpv-format GLSL shaders (bloc97/Anime4K, MIT)
// into a WebGL2 multi-pass pipeline for real-time anime upscaling.

import restoreSrc from "./Anime4K_Restore_CNN_M.glsl?raw";
import upscaleSrc from "./Anime4K_Upscale_CNN_x2_M.glsl?raw";

interface Pass {
  inputs: string[];
  output: string;
  outWidthExpr: string;
  outHeightExpr: string;
  body: string;
}

interface TextureSlot {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}

const VERT = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FULLSCREEN_QUAD = new Float32Array([
  -1, -1, 0, 0,
   1, -1, 1, 0,
   1,  1, 1, 1,
  -1, -1, 0, 0,
   1,  1, 1, 1,
  -1,  1, 0, 1,
]);

function parsePasses(src: string): Pass[] {
  const blocks = src.split(/\/\/!DESC\s*[^\n]*\n/).slice(1);
  const passes: Pass[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const inputs: string[] = [];
    let output = "MAIN";
    let outWidthExpr = "MAIN.w";
    let outHeightExpr = "MAIN.h";
    let contentStart = -1;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const m = line.match(/^\/\/!(BIND|SAVE|WIDTH|HEIGHT)\s*(.*)/);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        if (key === "BIND") inputs.push(val);
        else if (key === "SAVE") output = val;
        else if (key === "WIDTH") outWidthExpr = val;
        else if (key === "HEIGHT") outHeightExpr = val;
        continue;
      }
      // saltar cualquier otra directiva (//!HOOK, //!COMPONENTS, etc.)
      if (/^\/\/!/.test(line.trim())) continue;
      if (line.trim() !== "" && contentStart < 0) {
        contentStart = li; // first non-directive line (the #define block)
      }
    }
    if (contentStart < 0) continue;
    // body = from first content line (defines) through the closing "}" of hook()
    const body = lines.slice(contentStart).join("\n");
    const closeIdx = body.lastIndexOf("}");
    const bodyTrimmed = closeIdx >= 0 ? body.slice(0, closeIdx) : body;
    passes.push({ inputs, output, outWidthExpr, outHeightExpr, body: bodyTrimmed });
  }
  return passes;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile failed: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function convertTex(body: string, inputs: string[]): string {
  let out = body;
  for (const name of inputs) {
    // 1) texOff/tex sampling first (generates u_<name>_pt internally)
    const offRe = new RegExp(`${name}_texOff\\(vec2\\(([^)]*)\\)\\)`, "g");
    out = out.replace(offRe, (_, e) => `texture(u_${name}, v_uv + vec2(${e}) * u_${name}_pt)`);
    const texRe = new RegExp(`${name}_tex\\(([^)]+)\\)`, "g");
    out = out.replace(texRe, (_, e) => `texture(u_${name}, ${e})`);
    // 2) pos/pt/size — avoid re-prefixing the u_<name>_pt/size we just inserted
    out = out.replace(new RegExp(`(?<![uA-Za-z0-9_])${name}_pos`, "g"), "v_uv");
    out = out.replace(new RegExp(`(?<![uA-Za-z0-9_])${name}_pt`, "g"), `u_${name}_pt`);
    out = out.replace(new RegExp(`(?<![uA-Za-z0-9_])${name}_size`, "g"), `u_${name}_size`);
  }
  return out;
}

function buildFragmentShader(pass: Pass): string {
  const texDecls: string[] = [];
  for (const name of pass.inputs) {
    texDecls.push(`uniform sampler2D u_${name};`);
    texDecls.push(`uniform vec2 u_${name}_pt;`);
    texDecls.push(`uniform vec2 u_${name}_size;`);
  }

  const allLines = pass.body.split("\n");
  const defineLines = allLines.filter((l) => l.includes("#define"));
  const otherLines = allLines.filter(
    (l) => !l.includes("#define") && !l.includes("vec4 hook()")
  );

  const fnMacros: string[] = [];
  const gAssigns: string[] = [];

  for (const d of defineLines) {
    const fnMatch = d.match(/#define\s+(go_\w+)\s*\(([^)]+)\)\s*(.*)/);
    if (fnMatch) {
      const [, name, params, expr] = fnMatch;
      const [p1, p2] = params.split(",").map((s) => s.trim());
      const conv = convertTex(expr, pass.inputs);
      fnMacros.push(
        `vec4 ${name}(float ${p1}, float ${p2}) { return ${conv}; }`
      );
      continue;
    }
    const gMatch = d.match(/#define\s+(g_\w+)\s*(.*)/);
    if (gMatch) {
      const [, name, expr] = gMatch;
      const conv = convertTex(expr, pass.inputs);
      gAssigns.push(`vec4 ${name} = ${conv};`);
    }
  }

  const hookBody = convertTex(otherLines.join("\n"), pass.inputs);

  return `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
${texDecls.join("\n")}
${fnMacros.join("\n")}
vec4 hook() {
${gAssigns.map((g) => "    " + g).join("\n")}
${hookBody}
}
void main() { outColor = hook(); }
`;
}

function evalSizeExpr(expr: string, sizes: Record<string, [number, number]>): [number, number] {
  const tokens = expr.trim().split(/\s+/);
  const first = tokens[0];
  let w: number, h: number;
  if (first.includes(".w")) {
    const n = first.split(".")[0];
    [w, h] = sizes[n] || [1, 1];
  } else if (first.includes(".h")) {
    const n = first.split(".")[0];
    [, h] = sizes[n] || [1, 1];
    w = h;
  } else {
    [w, h] = sizes[first] || [1, 1];
  }
  // tokens like ["conv2d_last_tf.w", "2", "*"]  → scale = 2
  let scale = 1;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === "*" && i + 1 < tokens.length) {
      scale *= parseFloat(tokens[i + 1]);
      i++;
    } else if (/^\d+(\.\d+)?$/.test(tokens[i])) {
      scale *= parseFloat(tokens[i]);
    }
  }
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
}

export interface Anime4KOptions {
  restoreSrc?: string;
  upscaleSrc?: string;
}

export class Anime4KEngine {
  private gl: WebGL2RenderingContext;
  private passes: Pass[];
  private programs: WebGLProgram[] = [];
  private programMeta: { pass: Pass; prog: WebGLProgram; pt: Record<string, WebGLUniformLocation | null>; sz: Record<string, WebGLUniformLocation | null>; uni: Record<string, WebGLUniformLocation | null> }[] = [];
  private textures = new Map<string, TextureSlot>();
  private videoTex: WebGLTexture;
  private quadVao: WebGLVertexArrayObject;
  private blitProg: WebGLProgram | null = null;
  private blitUtex: WebGLUniformLocation | null = null;
  private floatRT = true;
  private count2 = 0;
  constructor(canvas: HTMLCanvasElement, opts: Anime4KOptions = {}) {
    const gl = canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;
    this.floatRT = gl.getExtension("EXT_color_buffer_float") !== null;
    if (!this.floatRT) {
      console.warn("[anime4k] EXT_color_buffer_float no disponible; usando RGBA8");
    }
    this.passes = [
      ...parsePasses(opts.restoreSrc ?? restoreSrc),
      ...parsePasses(opts.upscaleSrc ?? upscaleSrc),
    ];

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    for (const pass of this.passes) {
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, buildFragmentShader(pass));
      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, "a_pos");
      gl.bindAttribLocation(program, 1, "a_uv");
      gl.linkProgram(program);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Link failed: " + gl.getProgramInfoLog(program));
      }
      this.programs.push(program);
      const pt: Record<string, WebGLUniformLocation | null> = {};
      const sz: Record<string, WebGLUniformLocation | null> = {};
      const uni: Record<string, WebGLUniformLocation | null> = {};
      for (const input of pass.inputs) {
        pt[input] = gl.getUniformLocation(program, `u_${input}_pt`);
        sz[input] = gl.getUniformLocation(program, `u_${input}_size`);
        uni[input] = gl.getUniformLocation(program, `u_${input}`);
      }
      this.programMeta.push({ pass, prog: program, pt, sz, uni });
    }

    this.videoTex = gl.createTexture()!;
  }

  private allocTexture(name: string, w: number, h: number): TextureSlot {
    const gl = this.gl;
    const prev = this.textures.get(name);
    if (prev && prev.w === w && prev.h === h) return prev;
    if (prev) {
      gl.deleteTexture(prev.tex);
      gl.deleteFramebuffer(prev.fb);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Framebuffer incomplete: " + status);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const slot: TextureSlot = { tex, fb, w, h };
    this.textures.set(name, slot);
    return slot;
  }

  private uploadVideo(video: HTMLVideoElement, _w: number, _h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(video: HTMLVideoElement, srcW: number, srcH: number) {
    this.uploadVideo(video, srcW, srcH);
    this.runPipeline(this.videoTex, srcW, srcH);
  }

  /** Executes the Anime4K pass pipeline with an arbitrary source texture. */
  runPipeline(sourceTex: WebGLTexture, srcW: number, srcH: number) {
    const gl = this.gl;
    // Las texturas de pasos se reusan entre frames (allocTexture devuelve la
    // existente si el tamaño coincide). NO borrar aquí: esto.hay videoTex y
    // las __tex_pN se reciclan; borrar en dispose().

    const sizes: Record<string, [number, number]> = { MAIN: [srcW, srcH] };
    // registrar la textura fuente real como MAIN
    this.textures.set("__tex_video", {
      tex: sourceTex,
      fb: null as unknown as WebGLFramebuffer,
      w: srcW,
      h: srcH,
    });
    sizes["__tex_video"] = [srcW, srcH];
    // mapea nombre lógico -> slot único
    const lastOutput: Record<string, string> = { MAIN: "__tex_video" };
    let finalTexName = "__tex_video";

    for (let pi = 0; pi < this.passes.length; pi++) {
      const meta = this.programMeta[pi];
      const pass = meta.pass;
      const [outW, outH] = evalSizeExpr(pass.outWidthExpr, sizes);
      // slot único por pass -> nunca hay feedback loop
      const outName = `__tex_p${pi}`;
      const outSlot = this.allocTexture(outName, outW, outH);
      sizes[pass.output] = [outW, outH];

      gl.useProgram(meta.prog);
      for (let i = 0; i < pass.inputs.length; i++) {
        const input = pass.inputs[i];
        const texName = lastOutput[input];
        if (!texName) throw new Error("missing input " + input + " for pass " + pi);
        const slot = this.textures.get(texName);
        if (!slot) throw new Error("missing texture " + texName + " for pass " + pi);
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, slot.tex);
        if (meta.uni[input]) gl.uniform1i(meta.uni[input], i);
        if (meta.pt[input]) gl.uniform2f(meta.pt[input], 1 / slot.w, 1 / slot.h);
        if (meta.sz[input]) gl.uniform2f(meta.sz[input], slot.w, slot.h);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, outSlot.fb);
      gl.viewport(0, 0, outW, outH);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      // registrar la salida DESPUÉS del draw (si no, el pass leería su propio output)
      lastOutput[pass.output] = outName;
      finalTexName = outName;
    }

    // blit final
    const final = this.textures.get(finalTexName);
    if (!final) throw new Error("no final texture");
    const fw = final.w, fh = final.h;
    const canvas = this.gl.canvas as HTMLCanvasElement;
    if (canvas.width !== fw || canvas.height !== fh) {
      canvas.width = fw;
      canvas.height = fh;
    }

    if (!this.blitProg) {
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
      const fs = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
void main() { outColor = texture(u_tex, v_uv); }`
      );
      this.blitProg = gl.createProgram()!;
      gl.attachShader(this.blitProg, vs);
      gl.attachShader(this.blitProg, fs);
      gl.bindAttribLocation(this.blitProg, 0, "a_pos");
      gl.bindAttribLocation(this.blitProg, 1, "a_uv");
      gl.linkProgram(this.blitProg);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      this.blitUtex = gl.getUniformLocation(this.blitProg, "u_tex");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(this.blitProg!);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, final.tex);
    gl.uniform1i(this.blitUtex, 0);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  /** Debug: blit the raw video texture to the canvas (bypasses the CNN). */
  debugRawVideo(video: HTMLVideoElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const canvas = this.gl.canvas as HTMLCanvasElement;
    if (!this.blitProg) {
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
      const fs = compileShader(
        gl,
        gl.FRAGMENT_SHADER,
        `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
void main() { outColor = texture(u_tex, v_uv); }`
      );
      this.blitProg = gl.createProgram()!;
      gl.attachShader(this.blitProg, vs);
      gl.attachShader(this.blitProg, fs);
      gl.bindAttribLocation(this.blitProg, 0, "a_pos");
      gl.bindAttribLocation(this.blitProg, 1, "a_uv");
      gl.linkProgram(this.blitProg);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      this.blitUtex = gl.getUniformLocation(this.blitProg, "u_tex");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    // debug: clear a red frame first to confirm the display works
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if ((this.count2++ % 60) === 0) {
      const px = new Uint8Array(4);
      gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      console.log(
        "[anime4k] debug canvas size=" + canvas.width + "x" + canvas.height +
        " readPixels(1,1)=" + px[0] + "," + px[1] + "," + px[2] +
        " gl=" + (gl.getError ? "err:" + gl.getError() : "n/a")
      );
    }
    gl.useProgram(this.blitProg!);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.uniform1i(this.blitUtex, 0);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    for (const { tex, fb } of this.textures.values()) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fb);
    }
    this.textures.clear();
    for (const p of this.programs) gl.deleteProgram(p);
    gl.deleteTexture(this.videoTex);
    gl.deleteVertexArray(this.quadVao);
    if (this.blitProg) gl.deleteProgram(this.blitProg);
  }
}
