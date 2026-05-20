export type CarState = 'cruising' | 'reacting' | 'braking' | 'crashed' | 'stopped' | 'turning';

export interface Car {
  id: string;
  lane: number;           // For highway: 0-Fast, 1-Middle, 2-Slow, 3-Ramp. For Intersection: 0-Main Road Eastbound, 1-Main Road Westbound, 2-Cross Road Northbound, 3-Cross Road Southbound
  x: number;              // Position along the main road (0 to 3000) or lateral cross street
  z: number;              // Lateral position
  targetZ: number;        // Target lateral position
  y: number;              
  speed: number;          
  targetSpeed: number;    
  accel: number;          
  state: CarState;
  direction: 'EW' | 'WE' | 'NS' | 'SN'; // Traveling direction for intersection
  isViolationRunner?: boolean; // Red-light runner flag
  
  // Core size
  length: number;
  width: number;
  height: number;
  color: string;
  
  // Driver Traits
  attention: number;      
  baseSpeed: number;      
  safeGap: number;        
  reactionTime: number;   
  reactionTimer: number;  
  
  // State flags
  alertedByVMS: boolean;  
  brakingIntensely: boolean; 
  originalColor: string;
  
  // Analytics Tracking
  timeCreated: number;
  hasCrashed: boolean;
  successSlowing: boolean;
  wasInQueue: boolean;    
}

export interface VMSConfig {
  x: number;              
  active: boolean;        
  warningDistance: number; 
}

export interface SimulationConfig {
  mode: 'highway' | 'intersection';
  avgSpeed: number;       
  attentionLevel: number; 
  safeFollowingGap: number;
  trafficDensity: number; 
  vmsDistance: number;    
  cameraView: 'free' | 'follow' | 'vms' | 'accident' | 'drone' | 'intersection';
  // Intersection Settings
  trafficLightAuto: boolean;
  trafficLightDuration: number; // green light duration in seconds
}

export interface AnalyticsReport {
  timestamp: string;
  mode: 'highway' | 'intersection';
  primaryCrashLocation: number;
  primaryCrashTime: number;
  secondaryCrashes: number;
  maxQueueLength: number; 
  vmsEffectivenessRate?: number; 
  carsAlertedCount?: number;
  carsSavedCount?: number;
  
  // Intersection metrics
  collisionType?: 'T-Bone 側撞' | 'Rear-End 追尾' | 'Head-On 對撞' | 'Pedestrian Collision 行人事故';
  pedestrianHit?: boolean;
  redLightRunnersBlocked?: number;
  
  overallSeverity: 'A' | 'B' | 'C' | 'D' | 'F';
}

