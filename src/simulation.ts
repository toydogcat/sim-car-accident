import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pane } from 'tweakpane';
import { Car, CarState, SimulationConfig, VMSConfig, AnalyticsReport } from './types';

// Constants
const HIGHWAY_LENGTH = 3000;
const LANE_WIDTH = 3.5;
const LANE_Z_MIN = -5.25; // Lane 0, 1, 2 centers: -3.5, 0, 3.5
const LANE_Z_OFFSETS = [-3.5, 0, 3.5, 7.0]; // Fast, Middle, Slow, On-Ramp
const CAR_COLORS = ['#ffffff', '#e2e8f0', '#94a3b8', '#475569', '#3b82f6', '#ef4444', '#10b981', '#f59e0b'];

export class HighwaySimulation {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private pane!: any;

  // Simulation Entities
  private cars: Car[] = [];
  private carMeshes: Map<string, THREE.Group> = new Map();
  private particles: Array<{
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    rotationSpeed: THREE.Vector3;
    scaleSpeed: number;
    life: number;
    maxLife: number;
  }> = [];

  // VMS Signboard
  private vmsConfig: VMSConfig = {
    x: 1200, // Position along highway
    active: false,
    warningDistance: 600, // Distance upstream to alert cars
  };
  private vmsMesh!: THREE.Group;
  private vmsScreenTextMesh!: THREE.Mesh;
  private vmsLeftLight!: THREE.Mesh;
  private vmsRightLight!: THREE.Mesh;

  // Infrastructure meshes
  private roadMesh!: THREE.Mesh;
  private rampMesh!: THREE.Mesh;

  // Spawner timers (ms)
  private lastSpawnTime = 0;
  private lastRampSpawnTime = 0;

  // Config State
  public config: SimulationConfig = {
    mode: 'highway',
    avgSpeed: 100, // km/h
    attentionLevel: 0.6,
    safeFollowingGap: 1.2,
    trafficDensity: 30, // cars per minute
    vmsDistance: 500, // distance upstream of collision where VMS is placed / warned
    cameraView: 'free',
    trafficLightAuto: true,
    trafficLightDuration: 8,
  };

  // 3D Visual Isolation Groups (showing/hiding based on selected mode)
  private highwayGroup!: THREE.Group;
  private intersectionGroup!: THREE.Group;

  // Urban Intersection - Traffic signal countdowns and phases
  private ewLightState: 'green' | 'yellow' | 'red' = 'green';
  private nsLightState: 'green' | 'yellow' | 'red' = 'red';
  private trafficLightTimer = 0;

  // Pedestrian crossing at X = 965
  private pedestrianActive = false;
  private pedestrianZ = -14;
  private pedestrianDir = 1; // 1 = moving south-to-north, -1 = north-to-south
  private pedestrianMesh!: THREE.Mesh;

  // Emissive signal bulb representations to update light states reactively
  private signalBulbs: {
    ew: { r: THREE.Mesh[]; y: THREE.Mesh[]; g: THREE.Mesh[] };
    ns: { r: THREE.Mesh[]; y: THREE.Mesh[]; g: THREE.Mesh[] };
  } = {
    ew: { r: [], y: [], g: [] },
    ns: { r: [], y: [], g: [] }
  };

  // Analytics Report Tracker
  private monitoringIncident = false;
  private incidentStartTime = 0;
  private primaryCrashLocation = -1;
  private secondaryCrashCount = 0;
  private maxQueueLengthMeasured = 0;
  private alertCount = 0;
  private savedCount = 0;

  // Callbacks to React UI
  private onStatsUpdate: (stats: {
    activeCars: number;
    avgSpeed: number;
    incidentActive: boolean;
    crashedCount: number;
    vmsStatus: boolean;
  }) => void;
  private onReportGenerated: (report: AnalyticsReport) => void;
  private paneContainer?: HTMLDivElement;

  constructor(
    canvas: HTMLCanvasElement,
    container: HTMLDivElement,
    onStatsUpdate: (stats: any) => void,
    onReportGenerated: (report: AnalyticsReport) => void,
    paneContainer?: HTMLDivElement
  ) {
    this.canvas = canvas;
    this.container = container;
    this.onStatsUpdate = onStatsUpdate;
    this.onReportGenerated = onReportGenerated;
    this.paneContainer = paneContainer;

    this.initThree();
    this.buildWorld();
    this.setupTweakpane();
    this.animate();

    // Populate initial traffic so the road isn't empty
    this.populateInitialTraffic();
  }

  // --- Initializers ---

  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a'); // Very handsome slate premium dark theme
    this.scene.fog = new THREE.FogExp2('#0f172a', 0.0035);

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      1,
      1000
    );
    this.camera.position.set(600, 35, 45); // General view focusing on the ramp area

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground
    this.controls.minDistance = 10;
    this.controls.maxDistance = 500;
    this.controls.target.set(800, 0, 0);

    // Transition to free-look mode immediately when user interacts/mouse-drags the canvas
    this.renderer.domElement.addEventListener('pointerdown', this.handleUserInteraction);
    this.renderer.domElement.addEventListener('wheel', this.handleUserInteraction);

    // Warm aesthetic lighting setup
    const ambientLight = new THREE.AmbientLight('#1e293b', 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight('#bae6fd', 1.2); // Cool blue skylight
    dirLight.position.set(300, 150, -100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 1000;
    const d = 200;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    // Warm yellow street lights effect (spaced down the road for structural rhythm)
    for (let x = 100; x < HIGHWAY_LENGTH; x += 400) {
      const pointLight = new THREE.PointLight('#fef08a', 0.4, 80);
      pointLight.position.set(x, 15, -8);
      this.scene.add(pointLight);

      // Light post representation
      const poleGeo = new THREE.CylinderGeometry(0.15, 0.25, 15);
      const poleMat = new THREE.MeshStandardMaterial({ color: '#475569' });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 7.5, -8);
      this.scene.add(pole);

      const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 3);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(x, 15, -6.5);
      this.scene.add(arm);
    }

    // Handle Window Resize
    window.addEventListener('resize', this.handleResize);
  }

  public handleResize = () => {
    if (!this.container || !this.renderer) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  private handleUserInteraction = () => {
    if (this.config.cameraView !== 'free') {
      this.config.cameraView = 'free';
    }
  };

  // --- World Building ---

  private buildWorld() {
    // Initialize isolation groups
    this.highwayGroup = new THREE.Group();
    this.scene.add(this.highwayGroup);

    this.intersectionGroup = new THREE.Group();
    this.intersectionGroup.visible = false; // Hidden in highway mode
    this.scene.add(this.intersectionGroup);

    // 1. Core Road Plane (Length 3000, Width 15, 3 lanes)
    const roadGeo = new THREE.PlaneGeometry(HIGHWAY_LENGTH, 15);
    const roadMat = new THREE.MeshStandardMaterial({
      color: '#1e293b', // Handsome dark slate asphalt
      roughness: 0.85,
    });
    this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
    this.roadMesh.rotation.x = -Math.PI / 2;
    this.roadMesh.position.set(HIGHWAY_LENGTH / 2, 0, 0);
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);

    // Green land fields on sides
    const fieldGeo = new THREE.PlaneGeometry(HIGHWAY_LENGTH, 1000);
    const fieldMat = new THREE.MeshStandardMaterial({
      color: '#022c22', // Subdued deep green
      roughness: 0.95,
    });
    const leftField = new THREE.Mesh(fieldGeo, fieldMat);
    leftField.rotation.x = -Math.PI / 2;
    leftField.position.set(HIGHWAY_LENGTH / 2, -0.05, -507.5);
    leftField.receiveShadow = true;
    this.scene.add(leftField);

    const rightField = new THREE.Mesh(fieldGeo, fieldMat);
    rightField.rotation.x = -Math.PI / 2;
    rightField.position.set(HIGHWAY_LENGTH / 2, -0.05, 507.5);
    rightField.receiveShadow = true;
    this.scene.add(rightField);

    // Lane divider dashed lines (visual rhythm)
    const lineGeo = new THREE.PlaneGeometry(8, 0.15);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 });
    for (let x = 20; x < HIGHWAY_LENGTH; x += 30) {
      const mark1 = new THREE.Mesh(lineGeo, lineMat);
      mark1.rotation.x = -Math.PI / 2;
      mark1.position.set(x, 0.02, -1.75);
      this.scene.add(mark1);

      const mark2 = new THREE.Mesh(lineGeo, lineMat);
      mark2.rotation.x = -Math.PI / 2;
      mark2.position.set(x, 0.02, 1.75);
      this.scene.add(mark2);
    }

    // Outer solid yellow lines
    const sideLineGeo = new THREE.PlaneGeometry(HIGHWAY_LENGTH, 0.2);
    const yellowMat = new THREE.MeshBasicMaterial({ color: '#eab308' });
    const topYellow = new THREE.Mesh(sideLineGeo, yellowMat);
    topYellow.rotation.x = -Math.PI / 2;
    topYellow.position.set(HIGHWAY_LENGTH / 2, 0.02, -5.25);
    this.scene.add(topYellow);

    const botYellow = new THREE.Mesh(sideLineGeo, yellowMat);
    botYellow.rotation.x = -Math.PI / 2;
    botYellow.position.set(HIGHWAY_LENGTH / 2, 0.02, 5.25);
    this.scene.add(botYellow);

    // --- INTERSECTION URBAN SCENERY (North-South vertical street centered at X=1000) ---
    const crossRoadGeo = new THREE.PlaneGeometry(15, 600); // 15m wide, 600m long crossroad
    const crossRoadMat = new THREE.MeshStandardMaterial({
      color: '#1a2230', // Slab gray asphalt for intersection
      roughness: 0.85,
    });
    const crossRoadMesh = new THREE.Mesh(crossRoadGeo, crossRoadMat);
    crossRoadMesh.rotation.x = -Math.PI / 2;
    crossRoadMesh.position.set(1000, 0.005, 0); // slightly above background fields to prevent Z-fighting
    crossRoadMesh.receiveShadow = true;
    this.intersectionGroup.add(crossRoadMesh);

    // Double solid yellow centerlines on Crossroad
    const NSYellowDividerGeo = new THREE.PlaneGeometry(0.2, 600);
    const NSYellowDivider = new THREE.Mesh(NSYellowDividerGeo, yellowMat);
    NSYellowDivider.rotation.x = -Math.PI / 2;
    NSYellowDivider.position.set(1000, 0.015, 0);
    this.intersectionGroup.add(NSYellowDivider);

    // Pedestrian crosswalk markings (zebra lines) at X=965 across Eastbound highway lanes
    const crossWalkGroup1 = new THREE.Group();
    const zebraMarkGeo = new THREE.PlaneGeometry(1.5, 11);
    const zebraMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
    for (let zOffset = -5.0; zOffset <= 5.0; zOffset += 1.8) {
      const zebra = new THREE.Mesh(zebraMarkGeo, zebraMat);
      zebra.rotation.x = -Math.PI / 2;
      zebra.position.set(965, 0.02, zOffset);
      crossWalkGroup1.add(zebra);
    }
    this.intersectionGroup.add(crossWalkGroup1);

    // Pedestrian crosswalk markings at X=1035 across Westbound highway lanes
    const crossWalkGroup2 = new THREE.Group();
    for (let zOffset = -5.0; zOffset <= 5.0; zOffset += 1.8) {
      const zebra = new THREE.Mesh(zebraMarkGeo, zebraMat);
      zebra.rotation.x = -Math.PI / 2;
      zebra.position.set(1035, 0.02, zOffset);
      crossWalkGroup2.add(zebra);
    }
    this.intersectionGroup.add(crossWalkGroup2);

    // Stop lines on East-West main highway
    const stopLineGeo = new THREE.PlaneGeometry(11, 0.45);
    const stopLineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    
    // Eastbound Stop Line (at X=972)
    const stopEW = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopEW.rotation.y = Math.PI / 2; 
    stopEW.rotation.x = -Math.PI / 2;
    stopEW.position.set(972, 0.025, 0);
    this.intersectionGroup.add(stopEW);

    // Stop lines on North-South crossroad (at Z=-12 & Z=12)
    const stopNS1 = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopNS1.rotation.x = -Math.PI / 2;
    stopNS1.position.set(1000, 0.025, -12);
    this.intersectionGroup.add(stopNS1);

    const stopNS2 = new THREE.Mesh(stopLineGeo, stopLineMat);
    stopNS2.rotation.x = -Math.PI / 2;
    stopNS2.position.set(1000, 0.025, 12);
    this.intersectionGroup.add(stopNS2);

    // 3D Pedestrian visualization model
    const pedGeo = new THREE.BoxGeometry(0.7, 1.6, 0.5);
    const pedMat = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.8 }); // Fluorescent neon jacket
    this.pedestrianMesh = new THREE.Mesh(pedGeo, pedMat);
    this.pedestrianMesh.position.set(965, 0.8, -14); // starts off-road north
    this.pedestrianMesh.visible = false;
    this.intersectionGroup.add(this.pedestrianMesh);

    // Build the 4 Traffic Light Poles
    this.buildTrafficLights();

    // 2. On-Ramp (閘道)
    // Ramp starts at X=400, Z=12 and goes parallel down to X=850, Z=7.0, merges by X=1100
    const rampGroup = new THREE.Group();

    // Diag section of ramp
    const rampDiagGeo = new THREE.BoxGeometry(300, 0.1, 4);
    const rampMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.85 });
    const rampDiag = new THREE.Mesh(rampDiagGeo, rampMat);
    rampDiag.position.set(550, 0, 10.5);
    rampDiag.rotation.y = -Math.atan2(7.0 - 14.0, 300); // slight slant
    rampGroup.add(rampDiag);

    // Parallel section of ramp (X=700 to 1050, Z=7.0)
    const rampParallelGeo = new THREE.BoxGeometry(350, 0.1, 4);
    const rampParallel = new THREE.Mesh(rampParallelGeo, rampMat);
    rampParallel.position.set(875, 0, 7.0);
    rampGroup.add(rampParallel);

    // Yellow divider separating highway from merging ramp
    const guardLineGeo = new THREE.PlaneGeometry(300, 0.25);
    const guardLine = new THREE.Mesh(guardLineGeo, yellowMat);
    guardLine.rotation.x = -Math.PI / 2;
    guardLine.position.set(850, 0.03, 5.25);
    rampGroup.add(guardLine);

    this.highwayGroup.add(rampGroup);

    // 3. VMS Signboard Architecture (Portal hanging over the highway)
    this.buildVMSSignboard();
  }

  private buildTrafficLights() {
    const lightPoles = [
      { id: 'NW', x: 988, z: -10, rotation: 0 },
      { id: 'SE', x: 1012, z: 10, rotation: Math.PI },
      { id: 'NE', x: 1012, z: -10, rotation: -Math.PI / 2 },
      { id: 'SW', x: 988, z: 10, rotation: Math.PI / 2 },
    ];

    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 10);
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.5 });
    const signalBoxGeo = new THREE.BoxGeometry(0.8, 2.0, 0.6);
    const signalBoxMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4 });

    const bulbGeo = new THREE.SphereGeometry(0.22, 12, 12);

    lightPoles.forEach((p) => {
      const poleGroup = new THREE.Group();
      poleGroup.position.set(p.x, 0, p.z);

      const pole = new THREE.Mesh(poleGeo, darkMetalMat);
      pole.position.y = 5;
      pole.castShadow = true;
      poleGroup.add(pole);

      const box = new THREE.Mesh(signalBoxGeo, signalBoxMat);
      box.position.set(0, 9.2, 0);
      box.rotation.y = p.rotation;
      poleGroup.add(box);

      const bulbsContainer = new THREE.Group();
      bulbsContainer.rotation.y = p.rotation;
      bulbsContainer.position.set(0, 9.2, 0);

      const rBulb = new THREE.Mesh(bulbGeo, new THREE.MeshStandardMaterial({ color: '#3d080a', roughness: 0.9 }));
      const yBulb = new THREE.Mesh(bulbGeo, new THREE.MeshStandardMaterial({ color: '#3d2208', roughness: 0.9 }));
      const gBulb = new THREE.Mesh(bulbGeo, new THREE.MeshStandardMaterial({ color: '#042d1e', roughness: 0.9 }));

      const bulbOffsetZ = 0.31;
      rBulb.position.set(0, 0.55, bulbOffsetZ);
      yBulb.position.set(0, 0, bulbOffsetZ);
      gBulb.position.set(0, -0.55, bulbOffsetZ);

      bulbsContainer.add(rBulb);
      bulbsContainer.add(yBulb);
      bulbsContainer.add(gBulb);
      poleGroup.add(bulbsContainer);

      this.intersectionGroup.add(poleGroup);

      const isEW = (p.id === 'NW' || p.id === 'SE');
      if (isEW) {
        this.signalBulbs.ew.r.push(rBulb);
        this.signalBulbs.ew.y.push(yBulb);
        this.signalBulbs.ew.g.push(gBulb);
      } else {
        this.signalBulbs.ns.r.push(rBulb);
        this.signalBulbs.ns.y.push(yBulb);
        this.signalBulbs.ns.g.push(gBulb);
      }
    });
  }

  private buildVMSSignboard() {
    this.vmsMesh = new THREE.Group();

    // Structural Pillars
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.4, 13);
    const metalMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      metalness: 0.7,
      roughness: 0.3,
    });

    const leftPillar = new THREE.Mesh(pillarGeo, metalMat);
    leftPillar.position.set(0, 6.5, -9);
    leftPillar.castShadow = true;
    this.vmsMesh.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, metalMat);
    rightPillar.position.set(0, 6.5, 9);
    rightPillar.castShadow = true;
    this.vmsMesh.add(rightPillar);

    // Overhead truss beam
    const beamGeo = new THREE.BoxGeometry(1.2, 0.8, 18.5);
    const beam = new THREE.Mesh(beamGeo, metalMat);
    beam.position.set(0, 12, 0);
    beam.castShadow = true;
    this.vmsMesh.add(beam);

    // VMS Display Screen Panel
    const boardGeo = new THREE.BoxGeometry(0.8, 3.5, 12);
    const boardMat = new THREE.MeshStandardMaterial({
      color: '#090d16',
      roughness: 0.4,
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 12, 0);
    board.castShadow = true;
    this.vmsMesh.add(board);

    // LED Screen surface
    const screenGeo = new THREE.PlaneGeometry(11.4, 2.9);
    const screenMat = new THREE.MeshBasicMaterial({
      color: '#000000',
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(-0.41, 12, 0);
    screen.rotation.y = -Math.PI / 2; // Facing upstream (towards oncoming cars coming from X=0)
    this.vmsMesh.add(screen);

    // Two warning beacon flashing lights on sides of the sign
    const lightGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const darkLightMat = new THREE.MeshStandardMaterial({ color: '#1e293b' });

    this.vmsLeftLight = new THREE.Mesh(lightGeo, darkLightMat);
    this.vmsLeftLight.position.set(-0.45, 12, -4.5);
    this.vmsMesh.add(this.vmsLeftLight);

    this.vmsRightLight = new THREE.Mesh(lightGeo, darkLightMat);
    this.vmsRightLight.position.set(-0.45, 12, 4.5);
    this.vmsMesh.add(this.vmsRightLight);

    // Text Display Canvas texture
    this.updateVMSScreenTexture();

    this.vmsMesh.position.set(this.vmsConfig.x, 0, 0);
    this.scene.add(this.vmsMesh);
  }

  private updateVMSScreenTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Draw retro electronic pixel sign background
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, 512, 128);

    // Dynamic borders
    ctx.strokeStyle = this.vmsConfig.active ? '#ef4444' : '#22c55e';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);

    if (this.vmsConfig.active) {
      // Danger Flashing Display in traditional orange/red LED format
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ 事故前途 減速慢行 ⚠', 256, 55);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('CRASH AHEAD • SPEED 60 km/h', 256, 100);
    } else {
      // Normal standard display
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✔ 國道一號 路況順暢', 256, 55);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('LIMIT 100 km/h • FASTEN SEATBELT', 256, 100);
    }

    const texture = new THREE.CanvasTexture(canvas);
    if (this.vmsScreenTextMesh) {
      this.vmsMesh.remove(this.vmsScreenTextMesh);
    }

    const textPlaneGeo = new THREE.PlaneGeometry(11, 2.7);
    const textPlaneMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    this.vmsScreenTextMesh = new THREE.Mesh(textPlaneGeo, textPlaneMat);
    // Position slightly in front of the screen base to prevent z-fighting
    this.vmsScreenTextMesh.position.set(-0.43, 12, 0);
    this.vmsScreenTextMesh.rotation.y = -Math.PI / 2;
    this.vmsMesh.add(this.vmsScreenTextMesh);
  }

  // --- Setting Up Tweakpane Panel ---

  private setupTweakpane() {
    this.pane = new Pane({
      title: '3D 模擬參數控制台',
      expanded: true,
      container: this.paneContainer,
    });

    const element = this.pane.element;
    if (!this.paneContainer) {
      element.style.position = 'absolute';
      element.style.top = '16px';
      element.style.right = '16px';
      element.style.zIndex = '99';
      element.style.width = '290px';
    } else {
      element.style.width = '100%';
      element.style.boxShadow = 'none';
      element.style.border = 'none';
    }

    const fBehavior = this.pane.addFolder({ title: '👨💼 駕駛行為人因參數' });
    const avgSpeedInput = fBehavior.addBinding(this.config, 'avgSpeed', {
      label: '平均最高速 (km/h)',
      min: 40,
      max: 130,
      step: 5,
    });
    const attentionInput = fBehavior.addBinding(this.config, 'attentionLevel', {
      label: '駕駛專注度 ⛑',
      min: 0.1,
      max: 1.0,
      step: 0.05,
    });
    const safeGapInput = fBehavior.addBinding(this.config, 'safeFollowingGap', {
      label: '預期安全車距 (s)',
      min: 0.6,
      max: 2.5,
      step: 0.1,
    });

    avgSpeedInput.on('change', () => this.updateDriverBaselines());
    attentionInput.on('change', () => this.updateDriverBaselines());
    safeGapInput.on('change', () => this.updateDriverBaselines());

    if (this.config.mode === 'highway') {
      const fEnvironment = this.pane.addFolder({ title: '🛣️ 國道環境與基礎設施' });
      fEnvironment.addBinding(this.config, 'trafficDensity', {
        label: '流量密度 (台/分)',
        min: 10,
        max: 80,
        step: 5,
      });
      const vmsDistFolder = fEnvironment.addBinding(this.config, 'vmsDistance', {
        label: '看板警告距離 (米)',
        min: 200,
        max: 1000,
        step: 50,
      });

      const vmsPosSlider = fEnvironment.addBinding(this.vmsConfig, 'x', {
        label: '電子看板里程 X',
        min: 300,
        max: 2000,
        step: 50,
      });
      vmsPosSlider.on('change', (ev) => {
        this.vmsMesh.position.set(ev.value, 0, 0);
      });

      const fTriggers = this.pane.addFolder({ title: '⚡ 災難即時控制' });
      const btnCrash = fTriggers.addButton({ title: '💥 觸發隨機事故 (瞬間停滯)' });
      btnCrash.on('click', () => {
        this.triggerRandomCrash();
      });

      const btnClear = fTriggers.addButton({ title: '🧹 移除事故並排除路障' });
      btnClear.on('click', () => {
        this.clearAccident();
      });
    } else {
      // Intersection Controls
      const fSignals = this.pane.addFolder({ title: '🚦 智慧路口號誌控制' });
      
      fSignals.addBinding(this.config, 'trafficLightAuto', {
        label: '智慧自動輪放 🔄',
      });
      
      fSignals.addBinding(this.config, 'trafficLightDuration', {
        label: '綠燈通行秒數 (秒)',
        min: 4,
        max: 20,
        step: 1,
      });

      const btnSwap = fSignals.addButton({ title: '🎛️ 手動切換紅綠燈 (EW ⇄ NS)' });
      btnSwap.on('click', () => {
        // Toggle manual switch phases and disable auto
        this.config.trafficLightAuto = false;
        const isEWRed = this.ewLightState === 'red';
        this.ewLightState = isEWRed ? 'green' : 'red';
        this.nsLightState = isEWRed ? 'red' : 'green';
        this.rebuildTweakpane();
      });

      const fTriggers = this.pane.addFolder({ title: '⚡ 災難即時控制' });
      const btnCrash = fTriggers.addButton({ title: '💥 瞬間煞車失靈 闖紅燈撞車' });
      btnCrash.on('click', () => {
        this.triggerRedLightRunner();
      });

      const btnPed = fTriggers.addButton({ title: '🚶‍♂️ 行人擅闖馬路 (穿越斑馬線)' });
      btnPed.on('click', () => {
        this.triggerPedestrianWalk();
      });

      const btnClear = fTriggers.addButton({ title: '🧹 移除事故並排除路障' });
      btnClear.on('click', () => {
        this.clearAccident();
      });
    }
  }

  public rebuildTweakpane() {
    this.pane.dispose();
    this.setupTweakpane();
  }

  public setMode(mode: 'highway' | 'intersection') {
    this.config.mode = mode;
    this.config.cameraView = mode === 'highway' ? 'free' : 'intersection';
    
    // Toggle ThreeJS group visibilities
    this.highwayGroup.visible = mode === 'highway';
    this.intersectionGroup.visible = mode === 'intersection';
    if (this.vmsMesh) {
      this.vmsMesh.visible = mode === 'highway';
    }

    // Reset statistics
    this.secondaryCrashCount = 0;
    this.maxQueueLengthMeasured = 0;
    this.monitoringIncident = false;
    this.pedestrianActive = false;
    this.pedestrianMesh.visible = false;
    this.pedestrianMesh.position.set(965, 0, -18);
    this.pedestrianZ = -18;
    this.pedestrianMesh.rotation.set(0, 0, 0);

    // Repopulate traffic
    this.populateInitialTraffic();

    // Rebuild UI Controls
    this.rebuildTweakpane();
  }

  public triggerRedLightRunner() {
    // Look for candidate car sitting behind stop line that we can mark as runner
    const candidate = this.cars.find(
      (c) =>
        c.state !== 'crashed' &&
        ((c.direction === 'EW' && c.x < 950 && c.x > 750) ||
         (c.direction === 'NS' && c.z < -20 && c.z > -160) ||
         (c.direction === 'SN' && c.z > 20 && c.z < 160))
    );

    if (candidate) {
      candidate.isViolationRunner = true;
      candidate.targetSpeed = (this.config.avgSpeed / 3.6) * 1.5;
      candidate.speed = candidate.targetSpeed;
      candidate.attention = 0.05;
    } else {
      // Direct fast spawner for dramatic collision
      const isEW = Math.random() > 0.5;
      if (isEW) {
        this.spawnCarAt(840, Math.floor(Math.random() * 3), (this.config.avgSpeed / 3.6) * 1.45, 'EW');
        const lastCar = this.cars[this.cars.length - 1];
        lastCar.isViolationRunner = true;
        lastCar.attention = 0.05;
      } else {
        const lane = Math.random() > 0.5 ? 0 : 1;
        const dir = lane === 0 ? 'NS' : 'SN';
        const startZ = lane === 0 ? -120 : 120;
        this.spawnCarAt(startZ, lane, (this.config.avgSpeed / 3.6) * 1.45, dir);
        const lastCar = this.cars[this.cars.length - 1];
        lastCar.isViolationRunner = true;
        lastCar.attention = 0.05;
      }
    }
  }

  public triggerPedestrianWalk() {
    this.pedestrianActive = true;
    this.pedestrianZ = -18;
    this.pedestrianDir = 1;
    this.pedestrianMesh.position.set(965, 0, -18);
    this.pedestrianMesh.rotation.set(0, 0, 0);
    this.pedestrianMesh.visible = true;

    if (!this.monitoringIncident) {
      this.monitoringIncident = true;
      this.incidentStartTime = performance.now();
      this.primaryCrashLocation = 965;
      this.secondaryCrashCount = 0;
    }
  }

  // Set initial driver variations on spawn or slider update
  private updateDriverBaselines() {
    this.cars.forEach((car) => {
      if (car.state !== 'crashed' && car.state !== 'stopped') {
        // Apply scaling
        const factor = 1 + (Math.random() * 0.2 - 0.1); // +-10% rand
        car.targetSpeed = (this.config.avgSpeed / 3.6) * factor;

        // Custom attention for this car around the slider average
        car.attention = Math.max(0.05, Math.min(1.0, this.config.attentionLevel * (0.8 + Math.random() * 0.4)));
        car.safeGap = this.config.safeFollowingGap * (0.9 + Math.random() * 0.2);

        // reaction time = Math.max(0.15, Math.min(2.5, 0.2 / attention))
        car.reactionTime = Math.max(0.15, Math.min(2.5, 0.2 / car.attention));
      }
    });
  }

  // --- Dynamic Traffic Spawn Logic ---

  private populateInitialTraffic() {
    // Clear any existing cars first to prevent leaks
    this.cars.forEach((car) => {
      const mesh = this.carMeshes.get(car.id);
      if (mesh) this.scene.remove(mesh);
    });
    this.cars = [];
    this.carMeshes.clear();

    if (this.config.mode === 'highway') {
      // Spawn about 35 cars along the highway to make it immediately busy and realistic
      for (let i = 0; i < 35; i++) {
        const roadSegment = (HIGHWAY_LENGTH / 35) * i;
        if (roadSegment < 2500) {
          const lane = Math.floor(Math.random() * 3);
          const configSpeed = this.config.avgSpeed / 3.6;
          const speed = configSpeed * (0.8 + Math.random() * 0.3);
          this.spawnCarAt(roadSegment, lane, speed, 'EW');
        }
      }
    } else {
      // Intersection mode initial population: fill up Eastbound and Northbound
      // 1. Eastbound Main Road
      for (let i = 0; i < 20; i++) {
        const xPos = 50 + i * 110;
        if (xPos < HIGHWAY_LENGTH - 100 && Math.abs(xPos - 1000) > 40) {
          const lane = Math.floor(Math.random() * 3);
          const speed = (this.config.avgSpeed / 3.6) * (0.8 + Math.random() * 0.3);
          this.spawnCarAt(xPos, lane, speed, 'EW');
        }
      }
      // 2. Two-way North-South Cross Road (Z coordinates)
      for (let i = 0; i < 12; i++) {
        const zPos = -260 + i * 40;
        if (zPos < 260 && Math.abs(zPos) > 30) {
          const lane = Math.random() > 0.5 ? 0 : 1;
          const speed = (this.config.avgSpeed / 3.6) * (0.7 + Math.random() * 0.3);
          const dir = lane === 0 ? 'NS' : 'SN';
          this.spawnCarAt(zPos, lane, speed, dir);
        }
      }
    }
  }

  private handleTrafficSpawning(time: number) {
    if (this.config.trafficDensity <= 0) return;

    // Calculate spawn rate in ms
    const spawnInterval = (60 / this.config.trafficDensity) * 1000;

    if (this.config.mode === 'highway') {
      // 1. Spawning on Mainline Freeway
      if (time - this.lastSpawnTime > spawnInterval) {
        this.lastSpawnTime = time;

        const r = Math.random();
        const lane = r < 0.3 ? 0 : r < 0.7 ? 1 : 2;

        const spawnBlocked = this.cars.some((c) => c.direction === 'EW' && c.lane === lane && c.x < 45);
        if (!spawnBlocked) {
          const configSpeed = this.config.avgSpeed / 3.6;
          const initialSpeed = configSpeed * (0.9 + Math.random() * 0.15);
          this.spawnCarAt(0, lane, initialSpeed, 'EW');
        }
      }

      // 2. Spawning on On-Ramp
      const rampSpawnInterval = spawnInterval * 2.8;
      if (time - this.lastRampSpawnTime > rampSpawnInterval) {
        this.lastRampSpawnTime = time;

        const rampBlocked = this.cars.some((c) => c.lane === 3 && c.x < 500);
        if (!rampBlocked) {
          const rampStartSpeed = (this.config.avgSpeed / 3.6) * 0.7; // slower on ramp
          this.spawnCarAt(420, 3, rampStartSpeed, 'EW');
        }
      }
    } else {
      // Intersection mode - dynamic stream injections
      // 1. Eastbound (X axis) spawning
      if (time - this.lastSpawnTime > spawnInterval) {
        this.lastSpawnTime = time;
        const lane = Math.floor(Math.random() * 3);
        const spawnBlocked = this.cars.some((c) => c.direction === 'EW' && c.lane === lane && c.x < 55);
        if (!spawnBlocked) {
          const configSpeed = this.config.avgSpeed / 3.6;
          const speed = configSpeed * (0.85 + Math.random() * 0.2);
          this.spawnCarAt(0, lane, speed, 'EW');
        }
      }

      // 2. Two-way North-South spawning
      const nsSpawnInterval = spawnInterval * 1.35;
      if (time - this.lastRampSpawnTime > nsSpawnInterval) {
        this.lastRampSpawnTime = time;
        const lane = Math.random() > 0.5 ? 0 : 1;
        const dir = lane === 0 ? 'NS' : 'SN';
        const spawnZ = lane === 0 ? -280 : 280;
        const spawnBlocked = this.cars.some(
          (c) =>
            c.direction === dir &&
            c.lane === lane &&
            (dir === 'NS' ? c.z < -260 : c.z > 260)
        );
        if (!spawnBlocked) {
          const configSpeed = this.config.avgSpeed / 3.6;
          const speed = configSpeed * (0.75 + Math.random() * 0.2);
          this.spawnCarAt(spawnZ, lane, speed, dir);
        }
      }
    }
  }

  private spawnCarAt(pos: number, lane: number, speed: number, direction: 'EW' | 'WE' | 'NS' | 'SN' = 'EW') {
    const id = Math.random().toString(36).substr(2, 9);
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];

    const length = 4.0 + Math.random() * 1.5; // realistic low-poly sizes
    const width = 1.9 + Math.random() * 0.2;
    const height = 1.35 + Math.random() * 0.25;

    // Attention levels
    const carAttention = Math.max(
      0.05,
      Math.min(1.0, this.config.attentionLevel * (0.85 + Math.random() * 0.3))
    );
    const scaleSafeGap = this.config.safeFollowingGap * (0.85 + Math.random() * 0.3);
    const rTime = Math.max(0.15, Math.min(2.5, 0.2 / carAttention));

    let x = 0;
    let z = 0;

    if (direction === 'EW') {
      x = pos;
      z = LANE_Z_OFFSETS[lane];
    } else if (direction === 'NS') {
      x = 996.5; // Southbound (flowing towards +Z) on left of centerline
      z = pos;
    } else if (direction === 'SN') {
      x = 1003.5; // Northbound (flowing towards -Z) on right of centerline
      z = pos;
    }

    const newCar: Car = {
      id,
      lane,
      x,
      z,
      targetZ: z,
      y: 0,
      speed,
      targetSpeed: (this.config.avgSpeed / 3.6) * (0.9 + Math.random() * 0.2),
      accel: 0,
      state: 'cruising',
      direction,
      length,
      width,
      height,
      color,
      originalColor: color,
      attention: carAttention,
      baseSpeed: (this.config.avgSpeed / 3.6) * (0.9 + Math.random() * 0.2),
      safeGap: scaleSafeGap,
      reactionTime: rTime,
      reactionTimer: rTime,
      alertedByVMS: false,
      brakingIntensely: false,
      timeCreated: performance.now(),
      hasCrashed: false,
      successSlowing: false,
      wasInQueue: false,
    };

    // If ramp car in highway mode, set starting Z & Y offset slant
    if (this.config.mode === 'highway' && lane === 3) {
      newCar.z = 12.0;
      newCar.targetZ = 7.0; // merge lane runs alongside slow lane
    }

    this.cars.push(newCar);

    // Create 3D Visual Group for Car
    const carGroup = this.createCar3DVisual(newCar);
    this.scene.add(carGroup);
    this.carMeshes.set(id, carGroup);
  }

  private createCar3DVisual(car: Car): THREE.Group {
    const group = new THREE.Group();

    // Main Car body material (standard glossy lacquer)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: car.color,
      roughness: 0.2,
      metalness: 0.5,
    });

    // 1. Lower chassis box
    const chassisGeo = new THREE.BoxGeometry(car.length, car.height * 0.55, car.width);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = car.height * 0.275 + 0.35; // clear of wheels
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    // 2. Cabin / roof wedge
    const cabinGeo = new THREE.BoxGeometry(car.length * 0.55, car.height * 0.45, car.width * 0.85);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: '#0f172a', // Dark windows
      roughness: 0.1,
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-car.length * 0.1, car.height * 0.775 + 0.35, 0);
    cabin.castShadow = true;
    group.add(cabin);

    // 3. Small details: Front license plate / windshield
    const windGeo = new THREE.PlaneGeometry(car.width * 0.82, car.height * 0.42);
    const windColor = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.6 });
    const windshield = new THREE.Mesh(windGeo, windColor);
    windshield.position.set(car.length * 0.177, car.height * 0.75 + 0.35, 0);
    windshield.rotation.y = Math.PI / 2;
    windshield.rotation.x = -Math.PI / 6; // slant windscreen
    group.add(windshield);

    // 4. Taillights (Two small blocks at the back)
    // Red indicator braking lights
    const brakeGeo = new THREE.BoxGeometry(0.12, 0.25, 0.35);
    // Left brake light
    const brakeLMat = new THREE.MeshStandardMaterial({
      color: '#7f1d1d', // dim normal red
      emissive: '#330000',
    });
    const leftBrake = new THREE.Mesh(brakeGeo, brakeLMat);
    leftBrake.position.set(-car.length * 0.505, car.height * 0.35 + 0.35, -car.width * 0.35);
    leftBrake.name = 'brake_left';
    group.add(leftBrake);

    // Right brake light
    const brakeRMat = new THREE.MeshStandardMaterial({
      color: '#7f1d1d',
      emissive: '#330000',
    });
    const rightBrake = new THREE.Mesh(brakeGeo, brakeRMat);
    rightBrake.position.set(-car.length * 0.505, car.height * 0.35 + 0.35, car.width * 0.35);
    rightBrake.name = 'brake_right';
    group.add(rightBrake);

    // 5. Headlights (Bright LED headlights at the front)
    const headGeo = new THREE.BoxGeometry(0.12, 0.2, 0.3);
    const headMat = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#fef08a',
    });
    const leftHead = new THREE.Mesh(headGeo, headMat);
    leftHead.position.set(car.length * 0.505, car.height * 0.35 + 0.35, -car.width * 0.35);
    group.add(leftHead);

    const rightHead = new THREE.Mesh(headGeo, headMat);
    rightHead.position.set(car.length * 0.505, car.height * 0.35 + 0.35, car.width * 0.35);
    group.add(rightHead);

    // 6. Wheels (4 dark cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.45, 12);
    wheelGeo.rotateX(Math.PI / 2); // rotate cylinder horizontal
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#020617', roughness: 0.9 });

    // Front-Left
    const wFL = new THREE.Mesh(wheelGeo, wheelMat);
    wFL.position.set(car.length * 0.28, 0.35, -car.width * 0.47);
    wFL.name = 'wFL';
    group.add(wFL);

    // Front-Right
    const wFR = new THREE.Mesh(wheelGeo, wheelMat);
    wFR.position.set(car.length * 0.28, 0.35, car.width * 0.47);
    wFR.name = 'wFR';
    group.add(wFR);

    // Rear-Left
    const wRL = new THREE.Mesh(wheelGeo, wheelMat);
    wRL.position.set(-car.length * 0.28, 0.35, -car.width * 0.47);
    wRL.name = 'wRL';
    group.add(wRL);

    // Rear-Right
    const wRR = new THREE.Mesh(wheelGeo, wheelMat);
    wRR.position.set(-car.length * 0.28, 0.35, car.width * 0.47);
    wRR.name = 'wRR';
    group.add(wRR);

    // Group position update
    group.position.set(car.x, car.y, car.z);

    if (car.direction === 'NS') {
      group.rotation.y = Math.PI / 2;  // Southbound (facing +Z)
    } else if (car.direction === 'SN') {
      group.rotation.y = -Math.PI / 2; // Northbound (facing -Z)
    }

    return group;
  }

  // --- Particle FX (Smoky billowing cloud when crashed) ---

  private spawnSmokeAt(x: number, z: number, count = 2) {
    const smokeGeo = new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.9,
      transparent: true,
      opacity: 0.7,
      flatShading: true,
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(smokeGeo, smokeMat);
      mesh.position.set(
        x + (Math.random() * 3 - 1.5),
        1.0 + Math.random() * 0.5,
        z + (Math.random() * 1.5 - 0.75)
      );

      this.scene.add(mesh);

      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.random() * 1.5 + 1.0, // blow slightly down-freeway (drift)
          Math.random() * 2.0 + 2.0, // rise up
          Math.random() * 1.0 - 0.5 // drift sideways
        ),
        rotationSpeed: new THREE.Vector3(
          Math.random() * 0.5,
          Math.random() * 0.5,
          Math.random() * 0.5
        ),
        scaleSpeed: 1.0 + Math.random() * 1.0,
        life: 0,
        maxLife: 40 + Math.random() * 40, // frames
      });
    }
  }

  private updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;

      // Physics
      p.mesh.position.addScaledVector(p.velocity, 1 / 60);
      p.mesh.rotation.x += p.rotationSpeed.x;
      p.mesh.rotation.y += p.rotationSpeed.y;

      const scale = 1.0 + (p.life * p.scaleSpeed) / 10;
      p.mesh.scale.set(scale, scale, scale);

      // Fade out opacity
      const opacity = 0.7 * (1 - p.life / p.maxLife);
      if (p.mesh.material instanceof THREE.Material) {
        p.mesh.material.opacity = Math.max(0, opacity);
      }

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (p.mesh.material instanceof THREE.Material) {
          p.mesh.material.dispose();
        }
        this.particles.splice(i, 1);
      }
    }
  }

  // --- Accident Event Trigger ---

  public triggerRandomCrash() {
    // Choose a suitable car downstream that is cruising.
    // Skip cars near origin X<200 or end X>2500, to let user see nicely.
    const eligible = this.cars.filter(
      (c) => c.state !== 'crashed' && c.x > 300 && c.x < 1500 && c.lane < 3
    );

    if (eligible.length === 0) return;

    // Pick a random one
    const leadCar = eligible[Math.floor(Math.random() * eligible.length)];

    // Trigger local immediate stop crash!
    this.carCrash(leadCar, true);

    // Focus camera onto crash site if set as auto
    if (this.config.cameraView !== 'free' && this.config.cameraView !== 'drone') {
      this.config.cameraView = 'accident';
    }
  }

  private carCrash(car: Car, wasPrimary = false) {
    if (car.state === 'crashed') return;

    car.state = 'crashed';
    car.speed = 0;
    car.accel = 0;
    car.hasCrashed = true;

    // Turn charred/damaged black color visually
    const mesh = this.carMeshes.get(car.id);
    if (mesh) {
      // Find main chassis mesh and change color to burnt metallic black
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name !== 'wFL' && child.name !== 'wFR' && child.name !== 'wRL' && child.name !== 'wRR') {
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.color.set('#27272a'); // charred black steel
            child.material.roughness = 0.9;
            child.material.metalness = 0.1;
          }
        }
      });
    }

    // Spawn localized sparks/smoke
    this.spawnSmokeAt(car.x, car.z, 20);

    // Stats and Signboard alert triggers
    if (wasPrimary) {
      this.monitoringIncident = true;
      this.incidentStartTime = performance.now();
      this.primaryCrashLocation = car.x;
      this.secondaryCrashCount = 0;
      this.maxQueueLengthMeasured = 0;
      this.alertCount = 0;
      this.savedCount = 0;

      // Reset statistics for other vehicles
      this.cars.forEach((c) => {
        if (c.id !== car.id) {
          c.alertedByVMS = false;
          c.successSlowing = false;
          c.wasInQueue = false;
        }
      });

      // Activate warning sign upstream!
      this.vmsConfig.active = true;
      this.updateVMSScreenTexture();
    } else {
      this.secondaryCrashCount++;
    }
  }

  public clearAccident() {
    // 1. Turn off VMS warning system
    this.vmsConfig.active = false;
    this.updateVMSScreenTexture();

    // 2. Remove all crashed cars and let queued cars restore.
    // To make it look like tow truck did a swift clearance, we instantly fade out of existence the crashed cars
    const toRemove: string[] = [];
    this.cars = this.cars.filter((car) => {
      if (car.state === 'crashed') {
        toRemove.push(car.id);
        const mesh = this.carMeshes.get(car.id);
        if (mesh) {
          this.scene.remove(mesh);
          // clean visual memory
          mesh.traverse((c) => {
            if (c instanceof THREE.Mesh) {
              c.geometry.dispose();
              if (Array.isArray(c.material)) {
                c.material.forEach((m) => m.dispose());
              } else {
                c.material.dispose();
              }
            }
          });
        }
        this.carMeshes.delete(car.id);
        return false;
      }
      return true;
    });

    // Reset remaining cars trapped in traffic jam to cruising
    this.cars.forEach((car) => {
      if (car.state === 'stopped' || car.state === 'braking' || car.state === 'reacting') {
        car.state = 'cruising';
        car.speed = car.baseSpeed * 0.4; // creep forward to accelerate smoothly
        car.alertedByVMS = false;
        // restore custom speeds
        const factor = 1 + (Math.random() * 0.2 - 0.1);
        car.targetSpeed = (this.config.avgSpeed / 3.6) * factor;
      }
    });

    // Reset pedestrian state in intersection mode
    this.pedestrianActive = false;
    if (this.pedestrianMesh) {
      this.pedestrianMesh.visible = false;
      this.pedestrianZ = -18;
      this.pedestrianMesh.position.set(965, 0, -18);
      this.pedestrianMesh.rotation.set(0, 0, 0);
    }

    // Restore camera view from accident/follow lock
    if (this.config.cameraView === 'accident' || this.config.cameraView === 'follow') {
      this.config.cameraView = this.config.mode === 'highway' ? 'free' : 'intersection';
    }

    this.monitoringIncident = false;
  }

  // --- Core Agent Update Physics & Intelligence Loop ---

  private updateSimulation(dt: number) {
    const elapsed = performance.now();

    // 1. Spawning
    this.handleTrafficSpawning(elapsed);

    // 2. Clear out-of-bounds cars
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      let outOfBounds = false;
      if (car.direction === 'EW') {
        if (car.x > HIGHWAY_LENGTH) outOfBounds = true;
      } else if (car.direction === 'NS') {
        if (car.z > 300) outOfBounds = true;
      } else if (car.direction === 'SN') {
        if (car.z < -300) outOfBounds = true;
      }

      if (outOfBounds) {
        const mesh = this.carMeshes.get(car.id);
        if (mesh) this.scene.remove(mesh);
        this.carMeshes.delete(car.id);
        this.cars.splice(i, 1);
      }
    }

    // Sort cars descending by position along their primary axis
    // This helps sequentially process driver car-following (IDM) gaps!
    this.cars.sort((a, b) => {
      if (a.direction === 'EW' && b.direction === 'EW') return b.x - a.x;
      if (a.direction === 'NS' && b.direction === 'NS') return b.z - a.z;
      if (a.direction === 'SN' && b.direction === 'SN') return a.z - b.z; // smallest Z (furthest ahead) first for Northbound
      return 0;
    });

    // Handle traffic light sequence automation & pedestrian physics
    if (this.config.mode === 'intersection') {
      if (this.config.trafficLightAuto) {
        this.trafficLightTimer += dt;
        const greenDur = this.config.trafficLightDuration;
        const yellowDur = 2.0;
        const allRedDur = 3.0;

        // 3-phase cycle per direction (Green -> Yellow -> All Red)
        const phase1 = greenDur; // EW Green, NS Red
        const phase2 = greenDur + yellowDur; // EW Yellow, NS Red
        const phase3 = greenDur + yellowDur + allRedDur; // All Red clearance
        const phase4 = phase3 + greenDur; // EW Red, NS Green
        const phase5 = phase4 + yellowDur; // EW Red, NS Yellow
        const cycle = phase5 + allRedDur; // All Red clearance

        const localTime = this.trafficLightTimer % cycle;

        if (localTime < phase1) {
          this.ewLightState = 'green';
          this.nsLightState = 'red';
        } else if (localTime < phase2) {
          this.ewLightState = 'yellow';
          this.nsLightState = 'red';
        } else if (localTime < phase3) {
          this.ewLightState = 'red';
          this.nsLightState = 'red';
        } else if (localTime < phase4) {
          this.ewLightState = 'red';
          this.nsLightState = 'green';
        } else if (localTime < phase5) {
          this.ewLightState = 'red';
          this.nsLightState = 'yellow';
        } else {
          this.ewLightState = 'red';
          this.nsLightState = 'red';
        }
      }

      // Animate active pedestrian walking north-to-south/south-to-north across X=965 crosswalk
      if (this.pedestrianActive) {
        this.pedestrianZ += this.pedestrianDir * 3.5 * dt; // walk speed 3.5 m/s
        this.pedestrianMesh.position.z = this.pedestrianZ;
        this.pedestrianMesh.visible = true;

        // Auto turnaround / disappear at sidewalk boundaries
        if (this.pedestrianDir === 1 && this.pedestrianZ > 14) {
          this.pedestrianActive = false;
          this.pedestrianMesh.visible = false;
        } else if (this.pedestrianDir === -1 && this.pedestrianZ < -14) {
          this.pedestrianActive = false;
          this.pedestrianMesh.visible = false;
        }
      }
    }

    let stoppedQueueCount = 0;

    // 3. Sequential update for each vehicle
    this.cars.forEach((car, index) => {
      if (car.state === 'crashed') {
        // Continuous rising smoke
        if (Math.random() < 0.12) {
          this.spawnSmokeAt(car.x, car.z, 1);
        }
        return; // physics halted
      }

      // Identify leading vehicle (immediately preceding obstacle) on the SAME road stream & lane
      let leadCar: Car | null = null;
      for (let j = index - 1; j >= 0; j--) {
        const other = this.cars[j];
        if (other.direction === car.direction && other.lane === car.lane) {
          if (car.direction === 'EW' && other.x > car.x) {
            leadCar = other;
            break;
          } else if (car.direction === 'NS' && other.z > car.z) {
            leadCar = other;
            break;
          } else if (car.direction === 'SN' && other.z < car.z) {
            leadCar = other;
            break;
          }
        }
      }

      // If in Intersection mode, insert virtual stationary obstacle "stop lines" to trigger realistic halting response
      if (this.config.mode === 'intersection') {
        if (car.direction === 'EW') {
          const stopLineX = 971;
          const distToStop = stopLineX - car.x;
          // East-West traffic light check
          if (
            distToStop > 0 &&
            distToStop < 160 &&
            (this.ewLightState === 'red' || this.ewLightState === 'yellow') &&
            !car.isViolationRunner
          ) {
            if (!leadCar || leadCar.x > stopLineX) {
              leadCar = this.createVirtualObstacle(stopLineX, car.z, 'EW', car.lane);
            }
          }

          // Active Pedestrian in crosswalk crossing lanes check
          if (this.pedestrianActive && this.pedestrianZ > -7.5 && this.pedestrianZ < 7.5) {
            const crosswalkX = 964;
            const distToPed = crosswalkX - car.x;
            if (distToPed > 0 && distToPed < 95) {
              if (!leadCar || leadCar.x > crosswalkX) {
                leadCar = this.createVirtualObstacle(crosswalkX, car.z, 'EW', car.lane);
              }
            }
          }
        } else if (car.direction === 'NS') {
          // North-South (Southbound 'NS') traffic light check
          const stopLineZ = -12;
          const distToStop = stopLineZ - car.z;
          if (
            distToStop > 0 &&
            distToStop < 160 &&
            (this.nsLightState === 'red' || this.nsLightState === 'yellow') &&
            !car.isViolationRunner
          ) {
            if (!leadCar || leadCar.z > stopLineZ) {
              leadCar = this.createVirtualObstacle(car.x, stopLineZ, 'NS', car.lane);
            }
          }
        } else if (car.direction === 'SN') {
          // North-South (Northbound 'SN') traffic light check
          const stopLineZ = 12;
          const distToStop = car.z - stopLineZ;
          if (
            distToStop > 0 &&
            distToStop < 160 &&
            (this.nsLightState === 'red' || this.nsLightState === 'yellow') &&
            !car.isViolationRunner
          ) {
            if (!leadCar || leadCar.z < stopLineZ) {
              leadCar = this.createVirtualObstacle(car.x, stopLineZ, 'SN', car.lane);
            }
          }
        }
      }

      // Handle Freeway Ramp merging weave (Only in highway mode)
      if (this.config.mode === 'highway' && car.lane === 3) {
        if (car.x >= 900) {
          const targetLane = 2;
          const surroundingLane2 = this.cars.filter((c) => c.lane === targetLane && c.direction === 'EW');
          const margin = 35;
          const isBlocked = surroundingLane2.some((c) => Math.abs(c.x - car.x) < margin);

          if (!isBlocked || car.x > 1020) {
            car.lane = targetLane;
            car.targetZ = LANE_Z_OFFSETS[targetLane];
          } else {
            car.speed = Math.max(5, car.speed - 9 * dt);
          }
        }
      }

      // Handle Lane Changes to bypass slow traffic (Freeway mode only)
      if (this.config.mode === 'highway' && car.lane !== 3 && leadCar && car.state === 'cruising') {
        const gap = leadCar.x - car.x - leadCar.length;
        if (gap < 45 && leadCar.speed < car.speed - 3) {
          const possibleLanes: number[] = [];
          if (car.lane > 0) possibleLanes.push(car.lane - 1);
          if (car.lane < 2) possibleLanes.push(car.lane + 1);

          for (const l of possibleLanes) {
            const laneFree = !this.cars.some((c) => c.direction === 'EW' && c.lane === l && Math.abs(c.x - car.x) < 32);
            if (laneFree) {
              car.lane = l;
              car.targetZ = LANE_Z_OFFSETS[l];
              break;
            }
          }
        }
      }

      // 5. Intelligent Driver following and Reaction Model
      let gap = 10000;
      let closingSpeed = 0;

      if (leadCar) {
        if (car.direction === 'EW') {
          gap = leadCar.x - car.x - leadCar.length / 2 - car.length / 2;
        } else if (car.direction === 'NS') {
          gap = leadCar.z - car.z - leadCar.length / 2 - car.length / 2;
        } else if (car.direction === 'SN') {
          gap = car.z - leadCar.z - leadCar.length / 2 - car.length / 2;
        }
        closingSpeed = car.speed - leadCar.speed;
      }

      // --- ELECTRONIC VMS WARNING SIGN SYSTEM INTERACTION (Highway mode only) ---
      if (
        this.config.mode === 'highway' &&
        this.vmsConfig.active &&
        car.x >= this.vmsConfig.x &&
        car.x <= this.vmsConfig.x + 25 &&
        !car.alertedByVMS
      ) {
        car.alertedByVMS = true;
        this.alertCount++;

        car.attention = 1.0;
        car.reactionTime = 0.15; // fast brake-check reflex
        car.reactionTimer = 0.15;

        car.targetSpeed = Math.min(60 / 3.6, car.targetSpeed * 0.55);

        if (car.state === 'cruising') {
          car.state = 'braking';
        }
      }

      // Define hazard criteria (preceding car is braking or crashed)
      const hazardDetected =
        leadCar && (leadCar.state === 'crashed' || leadCar.state === 'braking' || leadCar.speed < 2);

      // Reaction Delay State Machine (The human factor simulation)
      if (hazardDetected && leadCar) {
        if (car.state === 'cruising') {
          car.state = 'reacting';
          car.reactionTimer = car.reactionTime;
        } else if (car.state === 'reacting') {
          car.reactionTimer -= dt;
          if (car.reactionTimer <= 0) {
            car.state = 'braking';
          }
        }
      } else {
        // No hazard immediately in front, restore cruise speed gradually
        if (car.state === 'reacting') {
          car.state = 'cruising';
        } else if (car.state === 'braking' && gap > 60) {
          car.state = 'cruising';
          if (car.alertedByVMS && !this.vmsConfig.active) {
            const factor = 1 + (Math.random() * 0.2 - 0.1);
            car.targetSpeed = (this.config.avgSpeed / 3.6) * factor;
            car.alertedByVMS = false;
          }
        }
      }

      // 6. Acceleration and Braking calculation physics
      let desiredAccel = 0;
      car.brakingIntensely = false;

      if (car.state === 'cruising') {
        const tGap = Math.max(15, 2.0 + car.speed * car.safeGap); // safe distance meters
        if (gap < tGap && leadCar) {
          const sSpeed = leadCar.speed;
          desiredAccel = 1.8 * (sSpeed - car.speed) - 0.5 * Math.max(0, (tGap - gap));
        } else {
          desiredAccel = 1.5 * (car.targetSpeed - car.speed) / (car.targetSpeed || 1);
        }
        desiredAccel = Math.min(2.5, Math.max(-4.5, desiredAccel));
      } else if (car.state === 'reacting') {
        desiredAccel = 0; // distraction: delayed braking response
      } else if (car.state === 'braking') {
        car.brakingIntensely = true;

        const maxDecel = 9.0; // max emergency deceleration limits
        const safetyBufferDistance = 6.0;

        if (leadCar) {
          const effectiveGap = gap - safetyBufferDistance;
          if (effectiveGap > 0.5) {
            const requiredDecel = (car.speed * car.speed) / (2 * effectiveGap) + (closingSpeed * 0.6);
            desiredAccel = -Math.min(maxDecel, Math.max(1.5, requiredDecel));
          } else {
            desiredAccel = -maxDecel;
          }
        } else {
          desiredAccel = -3.5 * (car.speed - car.targetSpeed);
        }
      }

      // Apply kinematics
      car.accel = desiredAccel;
      car.speed += car.accel * dt;

      // Stopped status check
      if (car.speed <= 0.1) {
        car.speed = 0;
        car.accel = 0;
        if (car.state === 'braking') {
          car.state = 'stopped';
        }
      }

      // Track queue indices
      if (car.speed < 1.0 && this.monitoringIncident) {
        // Highway queue monitoring
        if (this.config.mode === 'highway' && car.x < this.primaryCrashLocation) {
          stoppedQueueCount++;
          car.wasInQueue = true;
          if (car.alertedByVMS && !car.hasCrashed) {
            car.successSlowing = true;
          }
        }
      }

      // Advance vehicular positions along their coordinates
      if (car.direction === 'EW') {
        car.x += car.speed * dt;
      } else if (car.direction === 'NS') {
        car.z += car.speed * dt;
      } else if (car.direction === 'SN') {
        car.z -= car.speed * dt;
      }

      // Smooth lateral lane change motions (Z lane changes - highway mode only)
      if (this.config.mode === 'highway') {
        const turningSpeed = 3.5;
        if (Math.abs(car.z - car.targetZ) > 0.05) {
          car.z += Math.sign(car.targetZ - car.z) * turningSpeed * dt;
        } else {
          car.z = car.targetZ;
        }
      }

      // Evaluate 3D spatial overlaps (AABB sequential collision checks)
      if (leadCar && !leadCar.id.startsWith('stop_line') && !leadCar.id.startsWith('stop_walk')) {
        if (leadCar.state !== 'crashed' && gap <= 0.1) {
          this.carCrash(car, false);
          this.carCrash(leadCar, false);
        } else if (leadCar.state === 'crashed' && gap <= 0.5) {
          this.carCrash(car, false);
        }
      }

      // Active Pedestrian hit check
      if (
        this.config.mode === 'intersection' &&
        this.pedestrianActive &&
        car.direction === 'EW' &&
        Math.abs(car.x - 965) < 2.5 &&
        Math.abs(car.z - this.pedestrianZ) < 2.2
      ) {
        // 💥 Oh no! Driver runs over the active pedestrian!
        this.carCrash(car, false);
        this.pedestrianActive = false;
        
        // Tilt pedestrian mesh down to symbolize knockdown injury
        this.pedestrianMesh.rotation.x = Math.PI / 2;
        this.pedestrianMesh.position.y = 0.2;

        const incidentElapsed = performance.now() - this.incidentStartTime;
        const report: AnalyticsReport = {
          timestamp: new Date().toLocaleTimeString(),
          mode: 'intersection',
          primaryCrashLocation: 965,
          primaryCrashTime: Math.round(incidentElapsed / 1000),
          secondaryCrashes: this.secondaryCrashCount,
          maxQueueLength: 0,
          collisionType: 'Pedestrian Collision 行人事故',
          pedestrianHit: true,
          overallSeverity: 'F',
        };
        this.onReportGenerated(report);
      }
    });

    // Cross-stream T-bone collision solver (EW intersects NS collision window)
    if (this.config.mode === 'intersection') {
      this.cars.forEach((carA) => {
        if (carA.state === 'crashed') return;
        this.cars.forEach((carB) => {
          if (carA.id === carB.id || carB.state === 'crashed') return;
          if (carA.direction !== carB.direction) {
            const dx = carA.x - carB.x;
            const dz = carA.z - carB.z;
            const collisionRadius = 3.6;
            if (Math.abs(dx) < collisionRadius && Math.abs(dz) < collisionRadius) {
              // 💥 High speed T-bone cross collision!
              this.carCrash(carA, false);
              this.carCrash(carB, false);

              // Trigger secondary crash statistics
              if (!this.monitoringIncident) {
                this.monitoringIncident = true;
                this.incidentStartTime = performance.now();
                this.primaryCrashLocation = 1000;
                this.secondaryCrashCount = 0;

                const report: AnalyticsReport = {
                  timestamp: new Date().toLocaleTimeString(),
                  mode: 'intersection',
                  primaryCrashLocation: 1000,
                  primaryCrashTime: 3,
                  secondaryCrashes: 0,
                  maxQueueLength: 0,
                  collisionType: 'T-Bone 側撞',
                  overallSeverity: 'D',
                };
                this.onReportGenerated(report);
              }
            }
          }
        });
      });
    }

    // 7. Queue length measurement (farthest tail position back from primary crash)
    if (this.monitoringIncident) {
      const stoppedCarsInJam = this.cars.filter(
        (c) => c.speed < 2.0 && c.x < this.primaryCrashLocation && c.x > this.primaryCrashLocation - 600
      );
      if (stoppedCarsInJam.length > 0) {
        const trailingCar = stoppedCarsInJam[stoppedCarsInJam.length - 1]; // sorted descending, so last is smallest X
        const queueDist = this.primaryCrashLocation - trailingCar.x;
        if (queueDist > this.maxQueueLengthMeasured) {
          this.maxQueueLengthMeasured = Math.round(queueDist);
        }
      }

      // 8. Auto Incident Stability Resolver (Generate Analytics assessment report when everything settles)
      this.evaluateIncidentSettlement();
    }
  }

  private evaluateIncidentSettlement() {
    // If we are monitoring a crash aftermath but nothing is moving anymore downstream of the VMS
    // Or after 6 seconds of no additional crashes and all nearby cars are either stopped or passed.
    const incidentElapsed = performance.now() - this.incidentStartTime;

    // Check if there are active cars in the danger zone (X between vmsConfig.x - 200 and primaryCrashLocation + 100) still braking/reacting fast
    const dangerZoneActiveCars = this.cars.filter(
      (c) =>
        c.state !== 'crashed' &&
        c.state !== 'stopped' &&
        c.x > this.vmsConfig.x - 400 &&
        c.x < this.primaryCrashLocation + 80 &&
        c.speed > 5.0
    );

    // If everything is completely halted / has processed, and at least 4.5 seconds has elapsed:
    if (dangerZoneActiveCars.length === 0 && incidentElapsed > 4500 && this.monitoringIncident) {
      // Simulation stable! Generate official report card!
      this.monitoringIncident = false; // complete monitoring

      // VMS success counters
      const savedCount = this.cars.filter((c) => c.alertedByVMS && c.successSlowing && !c.hasCrashed).length;
      const totalAlerted = this.cars.filter((c) => c.alertedByVMS).length;

      const rate = totalAlerted > 0 ? (savedCount / totalAlerted) * 100 : 0;

      // Grade:
      // F: Secondary crash pile-up count >= 6
      // D: Pile-ups between 4 and 5
      // C: Pile-ups between 2 and 3
      // B: Pile-ups equal to 1
      // A: 0 secondary crashes (perfect mitigation!)
      let severityGrade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
      if (this.secondaryCrashCount >= 6) severityGrade = 'F';
      else if (this.secondaryCrashCount >= 4) severityGrade = 'D';
      else if (this.secondaryCrashCount >= 2) severityGrade = 'C';
      else if (this.secondaryCrashCount === 1) severityGrade = 'B';

      const report: AnalyticsReport = {
        mode: this.config.mode,
        timestamp: new Date().toLocaleTimeString(),
        primaryCrashLocation: Math.round(this.primaryCrashLocation),
        primaryCrashTime: Math.round(incidentElapsed / 1000),
        secondaryCrashes: this.secondaryCrashCount,
        maxQueueLength: this.maxQueueLengthMeasured,
        vmsEffectivenessRate: Math.round(rate),
        carsAlertedCount: totalAlerted,
        carsSavedCount: savedCount,
        overallSeverity: severityGrade,
      };

      this.onReportGenerated(report);
    }
  }

  // --- 3D Visual Rendering Synchronization Loop ---

  private update3DVisuals() {
    this.cars.forEach((car) => {
      const mesh = this.carMeshes.get(car.id);
      if (!mesh) return;

      // Smooth position lerp in 3D frame
      mesh.position.set(car.x, car.y, car.z);

      // Rotate wheels visually when moving
      const rotationSpeed = car.speed * 0.15;
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && (child.name.startsWith('wF') || child.name.startsWith('wR'))) {
          child.rotateY(rotationSpeed);
        }
      });

      // Update brake lights intensity material
      const leftBrake = mesh.getObjectByName('brake_left') as THREE.Mesh;
      const rightBrake = mesh.getObjectByName('brake_right') as THREE.Mesh;

      if (leftBrake && leftBrake.material instanceof THREE.MeshStandardMaterial) {
        if (car.brakingIntensely || car.state === 'stopped') {
          // Full luminous red glow
          leftBrake.material.color.set('#ef4444');
          leftBrake.material.emissive.set('#991b1b');
        } else {
          // Dull dim metallic red
          leftBrake.material.color.set('#7f1d1d');
          leftBrake.material.emissive.set('#330000');
        }
      }

      if (rightBrake && rightBrake.material instanceof THREE.MeshStandardMaterial) {
        if (car.brakingIntensely || car.state === 'stopped') {
          rightBrake.material.color.set('#ef4444');
          rightBrake.material.emissive.set('#991b1b');
        } else {
          rightBrake.material.color.set('#7f1d1d');
          rightBrake.material.emissive.set('#330000');
        }
      }
    });

    // Handle traffic light bulb emission visuals
    if (this.config.mode === 'intersection' && this.signalBulbs) {
      const activeRed = '#ef4444';
      const activeYellow = '#fbbf24';
      const activeGreen = '#10b981';

      // 1. EW Signal Bulbs
      this.signalBulbs.ew.r.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (this.ewLightState === 'red') {
          mat.color.set(activeRed);
          mat.emissive.set(activeRed);
        } else {
          mat.color.set('#450a0a');
          mat.emissive.set('#000000');
        }
      });
      this.signalBulbs.ew.y.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (this.ewLightState === 'yellow') {
          mat.color.set(activeYellow);
          mat.emissive.set(activeYellow);
        } else {
          mat.color.set('#451a03');
          mat.emissive.set('#000000');
        }
      });
      this.signalBulbs.ew.g.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (this.ewLightState === 'green') {
          mat.color.set(activeGreen);
          mat.emissive.set(activeGreen);
        } else {
          mat.color.set('#064e3b');
          mat.emissive.set('#000000');
        }
      });

      // 2. NS Signal Bulbs
      this.signalBulbs.ns.r.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (this.nsLightState === 'red') {
          mat.color.set(activeRed);
          mat.emissive.set(activeRed);
        } else {
          mat.color.set('#450a0a');
          mat.emissive.set('#000000');
        }
      });
      this.signalBulbs.ns.y.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (this.nsLightState === 'yellow') {
          mat.color.set(activeYellow);
          mat.emissive.set(activeYellow);
        } else {
          mat.color.set('#451a03');
          mat.emissive.set('#000000');
        }
      });
      this.signalBulbs.ns.g.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (this.nsLightState === 'green') {
          mat.color.set(activeGreen);
          mat.emissive.set(activeGreen);
        } else {
          mat.color.set('#064e3b');
          mat.emissive.set('#000000');
        }
      });
    }

    // Make active VMS flashing beacons blink orange/red
    if (this.vmsConfig.active) {
      const blinking = Math.floor(performance.now() / 250) % 2 === 0;
      if (this.vmsLeftLight.material instanceof THREE.MeshStandardMaterial) {
        this.vmsLeftLight.material.color.set(blinking ? '#ef4444' : '#1e293b');
        this.vmsLeftLight.material.emissive.set(blinking ? '#ea580c' : '#000000');
      }
      if (this.vmsRightLight.material instanceof THREE.MeshStandardMaterial) {
        this.vmsRightLight.material.color.set(blinking ? '#1e293b' : '#ef4444');
        this.vmsRightLight.material.emissive.set(blinking ? '#000000' : '#ea580c');
      }
    } else {
      if (this.vmsLeftLight.material instanceof THREE.MeshStandardMaterial) {
        this.vmsLeftLight.material.color.set('#1e293b');
        this.vmsLeftLight.material.emissive.set('#000000');
      }
      if (this.vmsRightLight.material instanceof THREE.MeshStandardMaterial) {
        this.vmsRightLight.material.color.set('#1e293b');
        this.vmsRightLight.material.emissive.set('#000000');
      }
    }
  }

  private createVirtualObstacle(x: number, z: number, direction: 'EW' | 'WE' | 'NS' | 'SN', lane: number): Car {
    return {
      id: 'stop_line_' + Math.random(),
      lane,
      x,
      z,
      targetZ: z,
      y: 0,
      speed: 0,
      targetSpeed: 0,
      accel: 0,
      state: 'stopped',
      direction,
      length: 0.1,
      width: 0.1,
      height: 0.1,
      color: '',
      originalColor: '',
      attention: 1.0,
      baseSpeed: 0,
      safeGap: 1.5,
      reactionTime: 0,
      reactionTimer: 0,
      alertedByVMS: false,
      brakingIntensely: false,
      timeCreated: 0,
      hasCrashed: false,
      successSlowing: false,
      wasInQueue: false,
    };
  }

  private handleCameraViews() {
    if (this.config.cameraView === 'free') {
      // Let OrbitControls handle it completely
      this.controls.enabled = true;
      return;
    }

    // Disable zoom controls physically during locking sequences
    this.controls.enabled = false;

    if (this.config.cameraView === 'follow') {
      // Find the crashed lead car or fastest car on road
      const crashed = this.cars.find((c) => c.state === 'crashed');
      const targetCar = crashed || this.cars[Math.floor(this.cars.length / 2)] || null;

      if (targetCar) {
        // Position camera slightly behind and looking down at the target
        const idealCamX = targetCar.x - 38;
        const idealCamY = 14;
        const idealCamZ = targetCar.z + 18;

        this.camera.position.lerp(new THREE.Vector3(idealCamX, idealCamY, idealCamZ), 0.08);
        this.controls.target.lerp(new THREE.Vector3(targetCar.x + 10, 1.5, targetCar.z), 0.1);
      }
    } else if (this.config.cameraView === 'vms') {
      // sits on top/slightly behind the VMS board looking downstream
      const vmsX = this.vmsConfig.x;
      const camPos = new THREE.Vector3(vmsX - 45, 17, 3);
      this.camera.position.lerp(camPos, 0.08);
      this.controls.target.lerp(new THREE.Vector3(vmsX + 50, 2, 0), 0.1);
    } else if (this.config.cameraView === 'accident') {
      // teleports camera right next to the crash site looking closely at the pile-up close
      const crashed = this.cars.filter((c) => c.state === 'crashed');
      if (crashed.length > 0) {
        // Average coordinates of crashes
        let avgX = 0;
        let avgZ = 0;
        crashed.forEach((c) => {
          avgX += c.x;
          avgZ += c.z;
        });
        avgX /= crashed.length;
        avgZ /= crashed.length;

        const camPos = new THREE.Vector3(avgX - 18, 5.5, avgZ - 10);
        this.camera.position.lerp(camPos, 0.08);
        this.controls.target.lerp(new THREE.Vector3(avgX + 4, 1.2, avgZ), 0.1);
      } else {
        // fallback to standard
        if (this.config.mode === 'intersection') {
          const camPos = new THREE.Vector3(1000 - 45, 30, 52);
          this.camera.position.lerp(camPos, 0.08);
          this.controls.target.lerp(new THREE.Vector3(1000, 1.0, 0), 0.1);
        } else {
          const targetX = this.vmsConfig.x + 100;
          const camPos = new THREE.Vector3(targetX - 40, 15, 15);
          this.camera.position.lerp(camPos, 0.08);
          this.controls.target.lerp(new THREE.Vector3(targetX, 0, 0), 0.1);
        }
      }
    } else if (this.config.cameraView === 'drone') {
      // Orthographic satellite-like view scrolling down highway
      const leadingC = this.cars.find((c) => c.state === 'crashed');
      const focusX = leadingC ? leadingC.x : this.vmsConfig.x + 100;

      // Stay high above centered
      const camPos = new THREE.Vector3(focusX - 30, 95, 1);
      this.camera.position.lerp(camPos, 0.08);
      this.controls.target.lerp(new THREE.Vector3(focusX - 30, 0, 0), 0.1);
    } else if (this.config.cameraView === 'intersection') {
      // High-altitude perspective overlooking the crossroads
      const camPos = new THREE.Vector3(1000 - 45, 30, 52);
      this.camera.position.lerp(camPos, 0.08);
      this.controls.target.lerp(new THREE.Vector3(1000, 1.0, 0), 0.1);
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);

    // Lock fixed DT of ~60fps (0.016s) to ensure collision physics and reactions don't stutter
    const dt = 0.0166;

    // A. Simulator logic and agents
    this.updateSimulation(dt);

    // B. FX Particles
    this.updateParticles();

    // C. 3D Meshes update positional maps
    this.update3DVisuals();

    // D. Multi-camera controller
    this.handleCameraViews();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // E. Feed React live statistical overlay details
    const activeCrashedCount = this.cars.filter((c) => c.state === 'crashed').length;
    const drivingCarsCount = this.cars.filter((c) => c.state !== 'crashed');
    const runningSpeedSum = drivingCarsCount.reduce((acc, car) => acc + car.speed, 0);
    const averageSpeedKmH =
      drivingCarsCount.length > 0 ? (runningSpeedSum / drivingCarsCount.length) * 3.6 : 0;

    this.onStatsUpdate({
      activeCars: this.cars.length,
      avgSpeed: Math.round(averageSpeedKmH),
      incidentActive: activeCrashedCount > 0,
      crashedCount: activeCrashedCount,
      vmsStatus: this.vmsConfig.active,
      ewLightState: this.ewLightState,
      nsLightState: this.nsLightState,
      pedestrianActive: this.pedestrianActive,
    } as any);
  };

  // --- Cleaners ---

  public destroy() {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handleUserInteraction);
    this.renderer.domElement.removeEventListener('wheel', this.handleUserInteraction);
    this.pane.dispose();

    // Traverse and clean scenes
    this.scene.clear();
    this.renderer.dispose();
  }
}
