
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { getAISuggestions } from './services/geminiService';
import { ModelMetadata, AISuggestion, RenderingConfig, SceneConfig } from './types';
import { Locale, translations } from './locales';
import { 
  Video, 
  Upload, 
  Play, 
  Square, 
  Settings, 
  Sparkles, 
  Download,
  Loader2,
  Maximize,
  Layers,
  Camera,
  Sun,
  Box,
  Languages,
  Zap,
  Palette,
  Eye,
  Activity,
  FileCode
} from 'lucide-react';

const App: React.FC = () => {
  const [lang, setLang] = useState<Locale>('zh');
  const t = translations[lang];

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'info' | 'ai' | 'settings' | 'export'>('info');

  const [sceneParams, setSceneParams] = useState<SceneConfig>({
    cameraPosition: { x: 300, y: 200, z: 300 },
    lookAt: { x: 0, y: 0, z: 0 },
    mainLightColor: "#ffffff",
    mainLightIntensity: 2.0,
    mainLightPosition: { x: 200, y: 400, z: 200 },
    ambientIntensity: 1.0,
    ambientColor: "#404040",
    environmentVibe: 'studio',
    backgroundColor: "#020617",
    exposure: 1.2,
    shadowsEnabled: true,
    animationSpeed: 1.0,
    fov: 45
  });

  const [renderConfig, setRenderConfig] = useState<RenderingConfig>({
    fps: 60,
    width: 1920,
    height: 1080,
    bitrate: 8000000 // 8Mbps
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    mixer: THREE.AnimationMixer | null;
    model: THREE.Group | THREE.Object3D | null;
    clock: THREE.Clock;
    controls: OrbitControls;
    mainLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
    floor: THREE.Mesh;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  // Sync scene state to Three.js objects
  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene, camera, renderer, mainLight, ambientLight, floor } = sceneRef.current;

    scene.background = new THREE.Color(sceneParams.backgroundColor);
    scene.fog = new THREE.Fog(sceneParams.backgroundColor, 500, 2000);
    
    camera.fov = sceneParams.fov;
    camera.updateProjectionMatrix();

    mainLight.intensity = sceneParams.mainLightIntensity;
    mainLight.color.set(sceneParams.mainLightColor);
    mainLight.position.set(sceneParams.mainLightPosition.x, sceneParams.mainLightPosition.y, sceneParams.mainLightPosition.z);
    mainLight.castShadow = sceneParams.shadowsEnabled;

    ambientLight.intensity = sceneParams.ambientIntensity;
    ambientLight.color.set(sceneParams.ambientColor);

    renderer.toneMappingExposure = sceneParams.exposure;
    floor.visible = sceneParams.shadowsEnabled;
  }, [sceneParams]);

  // Initialize Scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(sceneParams.backgroundColor);

    const camera = new THREE.PerspectiveCamera(sceneParams.fov, 1, 0.1, 5000);
    camera.position.set(sceneParams.cameraPosition.x, sceneParams.cameraPosition.y, sceneParams.cameraPosition.z);

    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      antialias: true,
      preserveDrawingBuffer: true 
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(800, 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = sceneParams.exposure;

    const ambientLight = new THREE.AmbientLight(sceneParams.ambientColor, sceneParams.ambientIntensity);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(sceneParams.mainLightColor, sceneParams.mainLightIntensity);
    mainLight.position.set(sceneParams.mainLightPosition.x, sceneParams.mainLightPosition.y, sceneParams.mainLightPosition.z);
    mainLight.castShadow = sceneParams.shadowsEnabled;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const grid = new THREE.GridHelper(2000, 50, 0x1e293b, 0x0f172a);
    scene.add(grid);

    const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.8 });
    const floor = new THREE.Mesh(planeGeometry, planeMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const clock = new THREE.Clock();

    sceneRef.current = { scene, camera, renderer, mixer: null, model: null, clock, controls, mainLight, ambientLight, floor };

    const animate = () => {
      if (!isRendering) {
        requestAnimationFrame(animate);
        const delta = clock.getDelta() * sceneParams.animationSpeed;
        if (sceneRef.current?.mixer) sceneRef.current.mixer.update(delta);
        if (sceneRef.current?.controls) sceneRef.current.controls.update();
        renderer.render(scene, camera);
      }
    };
    animate();

    const handleResize = () => {
      const parent = canvasRef.current?.parentElement;
      if (parent && !isRendering) {
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [isRendering]);

  const applyAISuggestion = (suggestion: AISuggestion) => {
    if (!sceneRef.current) return;
    const { controls } = sceneRef.current;
    setSceneParams(suggestion);
    controls.target.set(suggestion.lookAt.x, suggestion.lookAt.y, suggestion.lookAt.z);
    controls.update();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile || !sceneRef.current) return;

    setLoading(true);
    setFile(uploadedFile);
    setVideoUrl(null);

    const extension = uploadedFile.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const contents = e.target?.result as ArrayBuffer;
      let object: THREE.Object3D | null = null;
      let animations: THREE.AnimationClip[] = [];
      
      try {
        if (extension === 'fbx') {
          const loader = new FBXLoader();
          object = loader.parse(contents, '');
          animations = object.animations;
        } else if (extension === 'glb' || extension === 'gltf') {
          const loader = new GLTFLoader();
          const gltf = await new Promise<any>((resolve, reject) => {
            loader.parse(contents, '', resolve, reject);
          });
          object = gltf.scene;
          animations = gltf.animations;
        }

        if (!object) throw new Error("Unsupported format");

        if (sceneRef.current?.model) sceneRef.current.scene.remove(sceneRef.current.model);
        
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 250 / maxDim;
        object.scale.setScalar(scale);
        object.position.sub(center.multiplyScalar(scale));
        object.position.y += (size.y * scale) / 2;
        
        object.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        sceneRef.current!.scene.add(object);
        sceneRef.current!.model = object;

        // Store animations on the object for later access (normalized for both loaders)
        (object as any).animations = animations;

        if (animations.length > 0) {
          const mixer = new THREE.AnimationMixer(object);
          mixer.clipAction(animations[0]).play();
          sceneRef.current!.mixer = mixer;
        }

        const meta: ModelMetadata = {
          name: uploadedFile.name,
          boneCount: 0,
          animations: animations.map(a => ({ name: a.name, duration: a.duration }))
        };
        object.traverse((child) => { if ((child as THREE.Bone).isBone) meta.boneCount++; });

        setMetadata(meta);
        const suggestion = await getAISuggestions(meta, lang);
        setAiSuggestion(suggestion);
        applyAISuggestion(suggestion);
        setActiveTab('ai');

      } catch (err) {
        console.error("Error parsing model:", err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const startRendering = async () => {
    if (!canvasRef.current || !sceneRef.current?.mixer) return;

    setIsRendering(true);
    recordedChunks.current = [];
    setProgress(0);

    const { renderer, scene, camera, mixer } = sceneRef.current;
    
    const originalWidth = renderer.domElement.width;
    const originalHeight = renderer.domElement.height;
    renderer.setSize(renderConfig.width, renderConfig.height, false);
    camera.aspect = renderConfig.width / renderConfig.height;
    camera.updateProjectionMatrix();

    const stream = canvasRef.current.captureStream(renderConfig.fps);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: renderConfig.bitrate
    });

    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      setVideoUrl(URL.createObjectURL(blob));
      setIsRendering(false);
      setProgress(100);
      
      renderer.setSize(originalWidth, originalHeight, false);
      camera.aspect = originalWidth / originalHeight;
      camera.updateProjectionMatrix();
    };

    recorder.start();

    const root = mixer.getRoot() as THREE.Object3D & { animations: THREE.AnimationClip[] };
    const animationList = (root as any).animations || [];
    const animation = animationList.length > 0 ? animationList[0] : null;

    const duration = animation ? (mixer.existingAction(animation)?.getClip().duration || 5) : 5;
    const renderDuration = duration / sceneParams.animationSpeed;
    const totalFrames = renderDuration * renderConfig.fps;
    const frameTime = 1 / renderConfig.fps;
    
    mixer.stopAllAction();
    const action = animation ? mixer.clipAction(animation) : null;
    if (action) action.play();

    for (let i = 0; i < totalFrames; i++) {
      if (!isRendering && i > 0) break;
      mixer.setTime(i * frameTime * sceneParams.animationSpeed);
      renderer.render(scene, camera);
      await new Promise(r => setTimeout(r, 16)); 
      setProgress(Math.round((i / totalFrames) * 100));
    }

    recorder.stop();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 selection:bg-indigo-500/30 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-white/5 shadow-2xl z-10">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/20">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{t.title}</h1>
            <p className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold">{t.subtitle}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-3 py-2 rounded-xl transition border border-white/10"
          >
            <Languages className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">{lang === 'en' ? '中文' : 'EN'}</span>
          </button>
          <div className="w-[1px] h-6 bg-white/10 mx-1" />
          <label className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl cursor-pointer transition border border-white/10">
            <Upload className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold">{t.loadModel}</span>
            <input type="file" accept=".fbx,.glb,.gltf" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-96 bg-slate-900 border-r border-white/5 flex flex-col shadow-2xl relative z-10">
          <div className="flex border-b border-white/5">
            {[
              { id: 'info', icon: Box },
              { id: 'ai', icon: Sparkles },
              { id: 'settings', icon: Palette },
              { id: 'export', icon: Activity }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex-1 py-4 flex flex-col items-center gap-1 transition ${activeTab === tab.id ? 'text-indigo-400 border-b-2 border-indigo-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="text-[9px] font-bold uppercase tracking-tighter">{(t as any)[`tab${tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}`]}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-500">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="text-xs font-bold animate-pulse">{t.compiling}</p>
              </div>
            ) : metadata ? (
              <>
                {activeTab === 'info' && (
                   <div className="space-y-6 animate-in slide-in-from-left-4">
                     <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/5 shadow-inner">
                        <div className="flex items-center gap-3 mb-3 text-indigo-400">
                          {metadata.name.toLowerCase().endsWith('.fbx') ? <FileCode className="w-4 h-4"/> : <Box className="w-4 h-4"/>}
                          <span className="text-xs font-bold uppercase tracking-widest">{t.geometry}</span>
                        </div>
                        <p className="text-sm font-medium truncate mb-1">{metadata.name}</p>
                        <p className="text-[10px] text-slate-500">{metadata.boneCount} {t.skeleton}</p>
                     </div>
                     <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3 mb-3 text-indigo-400"><Layers className="w-4 h-4"/> <span className="text-xs font-bold uppercase tracking-widest">{t.sequences}</span></div>
                        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                          {metadata.animations.map((a, i) => (
                            <div key={i} className="flex justify-between items-center bg-black/20 p-2 rounded-lg text-[11px]">
                              <span className="font-mono text-slate-300 truncate w-32">{a.name || 'default'}</span>
                              <span className="text-slate-500">{a.duration.toFixed(2)}s</span>
                            </div>
                          ))}
                          {metadata.animations.length === 0 && (
                            <p className="text-[10px] text-slate-500 italic py-2 text-center">No animations found</p>
                          )}
                        </div>
                     </div>
                   </div>
                )}

                {activeTab === 'ai' && aiSuggestion && (
                   <div className="space-y-6 animate-in slide-in-from-right-4">
                      <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-5 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
                        <Sparkles className="absolute -right-4 -top-4 w-20 h-20 text-indigo-500/5 rotate-12" />
                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-4"><Camera className="w-4 h-4"/> {t.perspective}</h4>
                        <p className="text-sm font-bold text-white mb-2">{aiSuggestion.cameraAngle}</p>
                        <p className="text-xs text-slate-400 leading-relaxed italic">"{aiSuggestion.explanation}"</p>
                      </div>
                      <button 
                        onClick={() => applyAISuggestion(aiSuggestion)}
                        className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold uppercase tracking-widest transition"
                      >
                        Reset to AI Preset
                      </button>
                   </div>
                )}

                {activeTab === 'settings' && (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-2">
                        <Palette className="w-3 h-3" /> {t.visuals}
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-[9px] text-slate-500 uppercase mb-1 block">{t.bg}</span>
                          <input 
                            type="color" 
                            className="w-full h-8 bg-transparent cursor-pointer rounded overflow-hidden border border-white/10"
                            value={sceneParams.backgroundColor}
                            onChange={(e) => setSceneParams(p => ({...p, backgroundColor: e.target.value}))}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[9px] text-slate-500 uppercase mb-1 block">{t.exposure}</span>
                          <input 
                            type="range" min="0" max="3" step="0.1" 
                            className="w-full accent-indigo-500"
                            value={sceneParams.exposure}
                            onChange={(e) => setSceneParams(p => ({...p, exposure: Number(e.target.value)}))}
                          />
                        </label>
                      </div>
                      <label className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.shadows}</span>
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 accent-indigo-500"
                          checked={sceneParams.shadowsEnabled}
                          onChange={(e) => setSceneParams(p => ({...p, shadowsEnabled: e.target.checked}))}
                        />
                      </label>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-2">
                        <Sun className="w-3 h-3" /> {t.lightSettings}
                      </h4>
                      <div className="space-y-3">
                        <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                           <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-400">{t.mainLamp}</span>
                              <input 
                                type="color" 
                                className="w-6 h-6 bg-transparent cursor-pointer rounded"
                                value={sceneParams.mainLightColor}
                                onChange={(e) => setSceneParams(p => ({...p, mainLightColor: e.target.value}))}
                              />
                           </div>
                           <input 
                              type="range" min="0" max="10" step="0.1" 
                              className="w-full accent-indigo-500"
                              value={sceneParams.mainLightIntensity}
                              onChange={(e) => setSceneParams(p => ({...p, mainLightIntensity: Number(e.target.value)}))}
                           />
                        </div>
                        <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                           <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-400">{t.ambient}</span>
                              <input 
                                type="color" 
                                className="w-6 h-6 bg-transparent cursor-pointer rounded"
                                value={sceneParams.ambientColor}
                                onChange={(e) => setSceneParams(p => ({...p, ambientColor: e.target.value}))}
                              />
                           </div>
                           <input 
                              type="range" min="0" max="5" step="0.1" 
                              className="w-full accent-indigo-500"
                              value={sceneParams.ambientIntensity}
                              onChange={(e) => setSceneParams(p => ({...p, ambientIntensity: Number(e.target.value)}))}
                           />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-2">
                        <Zap className="w-3 h-3" /> {t.animSpeed}
                      </h4>
                      <div className="flex items-center gap-4">
                         <span className="text-xs font-mono text-slate-500">0.1x</span>
                         <input 
                           type="range" min="0.1" max="3" step="0.1" 
                           className="flex-1 accent-indigo-500"
                           value={sceneParams.animationSpeed}
                           onChange={(e) => setSceneParams(p => ({...p, animationSpeed: Number(e.target.value)}))}
                         />
                         <span className="text-xs font-mono text-indigo-400">{sceneParams.animationSpeed.toFixed(1)}x</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'export' && (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">{t.resolution}</span>
                        <select 
                          className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 ring-indigo-500/50 outline-none"
                          value={`${renderConfig.width}x${renderConfig.height}`}
                          onChange={(e) => {
                            const [w, h] = e.target.value.split('x').map(Number);
                            setRenderConfig(prev => ({ ...prev, width: w, height: h }));
                          }}
                        >
                          <option value="1280x720">720p (HD)</option>
                          <option value="1920x1080">1080p (FHD)</option>
                          <option value="2560x1440">1440p (QHD)</option>
                          <option value="3840x2160">2160p (4K)</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">{t.framerate}</span>
                        <select 
                          className="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 ring-indigo-500/50 outline-none"
                          value={renderConfig.fps}
                          onChange={(e) => setRenderConfig(prev => ({ ...prev, fps: Number(e.target.value) }))}
                        >
                          <option value="24">24 FPS ({t.cinematic})</option>
                          <option value="30">30 FPS ({t.standard})</option>
                          <option value="60">60 FPS ({t.smooth})</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">{t.bitrate}</span>
                        <div className="flex items-center gap-3">
                           <input 
                              type="range" min="1000000" max="25000000" step="1000000" 
                              className="flex-1 accent-indigo-500"
                              value={renderConfig.bitrate}
                              onChange={(e) => setRenderConfig(p => ({...p, bitrate: Number(e.target.value)}))}
                           />
                           <span className="text-xs font-mono text-indigo-400 w-12">{renderConfig.bitrate / 1000000}</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 text-center">
                <Box className="w-12 h-12 opacity-10" />
                <p className="text-xs uppercase tracking-widest font-bold">{t.waitingInput}</p>
              </div>
            )}
          </div>

          {videoUrl && (
            <div className="p-6 border-t border-white/5 bg-black/20">
              <a href={videoUrl} download="render.webm" className="flex items-center justify-center gap-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition shadow-xl shadow-indigo-600/30">
                <Download className="w-5 h-5" />
                {t.exportVideo}
              </a>
            </div>
          )}
        </aside>

        {/* Viewport */}
        <section className="flex-1 relative bg-black group overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          
          <div className="absolute top-6 left-6 pointer-events-none">
            <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${isRendering ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                {isRendering ? t.statusRendering : t.statusReady}
              </span>
            </div>
          </div>

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
            {isRendering ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{width: `${progress}%`}} />
                </div>
                <button onClick={() => setIsRendering(false)} className="flex items-center gap-3 bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-full font-bold shadow-2xl transition transform hover:scale-105 active:scale-95">
                  <Square className="w-4 h-4 fill-current" />
                  {t.cancelBtn} ({progress}%)
                </button>
              </div>
            ) : (
              <button 
                onClick={startRendering}
                disabled={!metadata}
                className="flex items-center gap-3 bg-white hover:bg-slate-200 disabled:bg-white/5 disabled:text-white/20 text-slate-950 px-10 py-5 rounded-full font-black uppercase tracking-widest transition transform hover:scale-105 active:scale-95 shadow-2xl shadow-white/5"
              >
                <Play className="w-5 h-5 fill-current" />
                {t.captureBtn}
              </button>
            )}
          </div>

          {!file && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xl animate-in fade-in">
              <div className="max-w-md w-full text-center space-y-8 p-12">
                 <div className="relative inline-block">
                    <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20" />
                    <div className="relative bg-slate-900 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto border border-white/10 shadow-2xl">
                      <Video className="w-12 h-12 text-indigo-500" />
                    </div>
                 </div>
                 <div>
                    <h2 className="text-3xl font-black mb-3">{t.dropTitle}</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">{t.dropDesc}</p>
                 </div>
                 <label className="inline-flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-5 rounded-2xl cursor-pointer font-black uppercase tracking-widest transition shadow-2xl shadow-indigo-600/40 transform hover:-translate-y-1">
                    <Upload className="w-5 h-5" />
                    {t.dropBtn}
                    <input type="file" accept=".fbx,.glb,.gltf" className="hidden" onChange={handleFileUpload} />
                 </label>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="px-6 py-3 bg-slate-900 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-black">
        <div className="flex gap-6">
          <span className="flex items-center gap-2"><div className="w-1 h-1 bg-indigo-500 rounded-full" /> {t.engine}: Three.js r182</span>
          <span className="flex items-center gap-2"><div className="w-1 h-1 bg-indigo-500 rounded-full" /> WebGPU-Ready</span>
          <span className="flex items-center gap-2"><div className="w-1 h-1 bg-indigo-500 rounded-full" /> {t.codec}: VP9</span>
        </div>
        <div className="opacity-40">
          {lang === 'zh' ? 'AI 导演逻辑由 Gemini 3.0 驱动' : 'Cinematic Logic Powered by Gemini 3.0'}
        </div>
      </footer>
    </div>
  );
};

export default App;
