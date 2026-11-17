// Solara Bay — shared tuning constants. One place for every number the
// other systems agree on, so balancing never means hunting literals.
export const CONFIG = {
  world: {
    halfSize: 260, // playable square is [-260, 260] on x and z
    roadHalfWidth: 7,
    blockSize: 58,
    gridStep: 72, // distance between road centrelines
    waterZ: 236, // bay water starts here (south edge)
    beachZ: 214, // sand strip starts here
  },
  player: {
    walkSpeed: 6,
    runSpeed: 10.5,
    turnSpeed: 9,
    radius: 0.6,
    maxHealth: 100,
    punchDamage: 25,
    punchRange: 2.2,
    punchCooldown: 0.45,
  },
  car: {
    accel: 22,
    brake: 34,
    reverseAccel: 12,
    maxSpeed: 42,
    maxReverseSpeed: 12,
    steerSpeed: 2.1,
    drag: 0.6,
    radius: 1.6,
    maxHealth: 100,
    stealWanted: 1,
  },
  traffic: { count: 14, speed: 9, minGap: 7 },
  pedestrians: { count: 26, walkSpeed: 1.6, fleeSpeed: 5.5, fleeRadius: 10 },
  police: {
    maxCars: 5,
    baseSpeed: 26,
    speedPerStar: 3.5,
    bustSeconds: 1.6, // contact time on foot before the player is busted
    decaySeconds: 25, // calm seconds before one star drops off
    fine: 250,
  },
  combat: {
    pistolDamage: 34,
    pistolRange: 55,
    pistolCooldown: 0.28,
    pistolAmmo: 24,
    pistolReserve: 48,
    thugHealth: 75,
    thugDamage: 8,
    thugSpeed: 4.2,
  },
  camera: { distance: 9.5, height: 4.2, minDistance: 5, maxDistance: 16 },
  saveKey: 'solara-bay-save-v1',
};

// Road centrelines of the grid, in world units.
export const ROAD_LINES = [-180, -108, -36, 36, 108, 180];

// Fixed points of interest in Solara Bay.
export const PLACES = {
  spawn: { x: 0, z: 120, heading: Math.PI },
  marina: { x: -150, z: 196 },
  docks: { x: -180, z: 150 },
  bank: { x: 36, z: -36 },
  hideout: { x: 180, z: 180 },
  market: { x: -36, z: 36 },
  hospital: { x: 108, z: -108 },
  dealership: { x: 144, z: -36 },
  pier: { x: -108, z: 224 },
};
