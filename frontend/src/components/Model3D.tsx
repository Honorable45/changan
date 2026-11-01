'use client';
import { useEffect, useRef, useState } from 'react';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

type Phase = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

/** Visualiseur GLB. Three.js et le modèle ne sont chargés qu'à la demande du visiteur. */
export function Model3D({ url, name, fallback }: { url: string; name: string; fallback: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const resetView = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase !== 'loading' || !host.current) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        if (disposed || !host.current) return;
        const el = host.current;
        const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4 || matchMedia('(max-width: 767px)').matches;
        const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: lowPower ? 'low-power' : 'high-performance' });
        renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.25 : 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.01, 1000);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
        controls.enablePan = false;
        controls.maxPolarAngle = Math.PI * 0.52;
        const render = () => renderer.render(scene, camera);
        const loop = () => { if (controls.update()) render(); };
        renderer.setAnimationLoop(loop);
        controls.addEventListener('change', render);

        const gltf = await new GLTFLoader().loadAsync(url, (e) => { if (e.total) setProgress(e.loaded / e.total); });
        if (disposed) { renderer.dispose(); return; }
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3()).length();
        gltf.scene.position.sub(box.getCenter(new THREE.Vector3()));
        scene.add(gltf.scene);
        const home = new THREE.Vector3(size * 0.8, size * 0.35, size * 1.05);
        controls.minDistance = size * 0.5;
        controls.maxDistance = size * 2.5;
        resetView.current = () => { camera.position.copy(home); controls.target.set(0, 0, 0); controls.update(); render(); };
        resetView.current();
        const ro = new ResizeObserver(() => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); render(); });
        ro.observe(el);
        cleanup = () => {
          ro.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); pmrem.dispose();
          scene.traverse((o) => { const m = o as import('three').Mesh; m.geometry?.dispose?.(); });
          renderer.dispose(); renderer.domElement.remove();
        };
        setPhase('ready');
      } catch {
        if (!disposed) setPhase('error');
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [phase === 'loading' || phase === 'ready', url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'error' || phase === 'unsupported') {
    return (
      <div role="status">
        <p className="mb-4 text-[0.9375rem] text-steel">{phase === 'error' ? 'Le modèle 3D n’a pas pu être chargé.' : 'Votre appareil ne permet pas l’affichage 3D.'} Voici les photographies.</p>
        {fallback}
      </div>
    );
  }
  return (
    <div>
      <div className="relative aspect-[16/9] bg-mist">
        <div ref={host} data-testid="model-host" aria-label={`Modèle 3D du ${name}`} role="img" className="absolute inset-0 touch-none" />
        {phase === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <button type="button" className="btn btn-primary" onClick={() => setPhase(webglAvailable() ? 'loading' : 'unsupported')}>Lancer la vue 3D</button>
          </div>
        )}
        {phase === 'loading' && <p role="status" className="num absolute inset-0 flex items-center justify-center text-sm">Chargement du modèle : {Math.round(progress * 100)} %</p>}
      </div>
      {phase === 'ready' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-steel">
          <p>Glissez pour tourner, pincez ou faites défiler pour zoomer.</p>
          <button type="button" onClick={() => resetView.current()} className="h-11 border border-line px-4 text-ink">Réinitialiser la vue</button>
        </div>
      )}
    </div>
  );
}
