'use client';

import { useEffect, useRef } from 'react';

export default function OrbitCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertex, `attribute vec2 p; uniform float t; void main(){ float a=t*.45; mat2 r=mat2(cos(a),-sin(a),sin(a),cos(a)); vec2 q=r*p; gl_Position=vec4(q,0.,1.); gl_PointSize=2.2; }`);
    gl.compileShader(vertex);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragment, `precision mediump float; uniform float t; void main(){ float d=length(gl_PointCoord-.5); float glow=smoothstep(.5,0.,d); gl_FragColor=vec4(.43,.49,1.,glow*.72); }`);
    gl.compileShader(fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.useProgram(program);
    const points = new Float32Array(360 * 2);
    for (let i = 0; i < 360; i++) { const a = i / 360 * Math.PI * 2; const r = .25 + (i % 9) / 34; points[i*2] = Math.cos(a) * r; points[i*2+1] = Math.sin(a) * r * .72; }
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const time = gl.getUniformLocation(program, 't'); let frame = 0; const started = performance.now();
    const draw = (now: number) => { gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(time, (now-started)/1000); gl.drawArrays(gl.POINTS, 0, 360); frame = requestAnimationFrame(draw); };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', onResize); gl.deleteProgram(program); };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="orbit-canvas" />;
}
