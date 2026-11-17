// missions.js — the story of Rico Vale in Solara Bay: six missions from
// Mara Solis, each with dialogue, an objective marker, a timer where it
// counts, and a cash reward. All characters and places are original.
(function () {
  'use strict';
  var U = window.SB.util;

  var MISSIONS = [
    {
      id: 1, title: 'Fresh Wheels', giver: 'Mara Solis', reward: 300,
      brief: 'Mara needs wheels for a job. Steal any car and bring it to her garage on Coral Row.',
      lines: [
        'MARA: Rico. You made it to Solara Bay. Good. First rule: nobody here owns a car. They borrow them.',
        'MARA: Take any car off the street and bring it to my garage. Try not to scratch it. Actually — scratch it, I like character.',
      ],
      objective: 'Steal a car and drive it to Mara\'s garage',
      type: 'driveTo', target: 'garage', needCar: true,
    },
    {
      id: 2, title: 'Bay Runner', giver: 'Mara Solis', reward: 450, timeLimit: 95,
      brief: 'A package for the pier kiosk. The buyer pays double if it lands before the lunch crowd. Drive fast, drive clean.',
      lines: [
        'MARA: Package on the back seat. Pier kiosk, south end. Ninety-five seconds, Rico. The tide waits for no courier.',
        'RICO: Ninety-five seconds across town? You hiring a driver or a rocket?',
        'MARA: Both. Go.',
      ],
      objective: 'Deliver the package to the pier kiosk',
      type: 'driveTo', target: 'pierKiosk', needCar: true,
    },
    {
      id: 3, title: 'Heat Check', giver: 'Mara Solis', reward: 500,
      brief: 'The Bay PD has a new captain who wants headlines. Show them you can slip a tail: get hot, then go cold at the hideout.',
      lines: [
        'MARA: The cops think this town is theirs. Prove them wrong. Get their attention — two stars, at least.',
        'MARA: Then vanish. Lose them and reach the hideout on the east side. If you can do that, you can do anything in this city.',
      ],
      objective: 'Reach 2 wanted stars, then lose the heat at the hideout',
      type: 'heatEscape', target: 'hideout', needStars: 2,
    },
    {
      id: 4, title: 'Pier Payback', giver: 'Mara Solis', reward: 600,
      brief: 'The Dock Rats skimmed Mara\'s last three drops. Four of them are drinking at the pier right now. Settle it — fists or pistol.',
      lines: [
        'MARA: Four Rats on the pier. They took my money and my patience. Take back both.',
        'RICO: Fists or the pistol?',
        'MARA: Your call. Just don\'t let them walk away from it.',
      ],
      objective: 'Deal with the 4 Dock Rats at the pier',
      type: 'gang', target: 'pierKiosk',
    },
    {
      id: 5, title: 'The Getaway', giver: 'Mara Solis', reward: 800,
      brief: 'Mara is riding with you tonight. Three stars of Bay PD will be on your tail before the first corner. Get her to the marina in one piece.',
      lines: [
        'MARA: Tonight I ride with you, Rico. The cops will come — three stars, easy. Don\'t stop. Don\'t panic.',
        'RICO: And if they catch us?',
        'MARA: Then you drive better next time. Marina. Go.',
      ],
      objective: 'Drive Mara to the marina while the police chase you',
      type: 'driveTo', target: 'marina', needCar: true, forceStars: 3,
    },
    {
      id: 6, title: 'King of the Bay', giver: 'Mara Solis', reward: 1500,
      brief: 'Three drops stashed around the city, one last run, then the lighthouse. Finish this and the whole bay knows the name Rico Vale.',
      lines: [
        'MARA: Three drops. One at the park, one downtown, one by the marina. Collect them all, then meet me at the lighthouse.',
        'MARA: Do this, Rico, and you are not the new guy anymore. You are the Bay.',
      ],
      objective: 'Collect the 3 drops, then reach the lighthouse',
      type: 'collect', targets: ['park', 'downtown', 'marina2'], target: 'lighthouse',
    },
  ];

  function MissionSystem(game) {
    this.game = game;
    this.index = 0;            // next mission to start (0-based)
    this.active = null;        // active mission def + runtime state
    this.marker = null;        // 3D beacon group
    this.markerTarget = null;  // {x,z}
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.missionTimer = 0;
    this.drops = [];
    this.collectCount = 0;
  }

  MissionSystem.prototype.completedCount = function () { return this.index; };
  MissionSystem.prototype.allDone = function () { return this.index >= MISSIONS.length; };

  MissionSystem.prototype.startNext = function () {
    if (this.allDone()) {
      this.game.hud.toast('All missions complete — Solara Bay is yours, Rico.', 'good');
      return false;
    }
    var def = MISSIONS[this.index];
    this.active = { def: def, phase: 0, timer: def.timeLimit || 0, escaped: false };
    this.dialogueQueue = def.lines.slice();
    this.dialogueTimer = 0;
    this.missionTimer = def.timeLimit || 0;
    this.collectCount = 0;
    this.game.hud.showMission(def);
    this.game.sfx.jingle();
    this.setupObjective();
    if (def.forceStars) this.game.police.addWanted(def.forceStars, 'The Bay PD is on you');
    if (def.type === 'gang') {
      this.game.peds.spawnGang([
        { x: -88, z: 300 }, { x: -72, z: 308 }, { x: -84, z: 318 }, { x: -76, z: 326 },
      ]);
      this.game.hud.toast('4 Dock Rats at the pier', 'bad');
    }
    if (def.type === 'collect') this.spawnDrops();
    return true;
  };

  MissionSystem.prototype.setupObjective = function () {
    var def = this.active.def;
    var sp = this.game.world.spawnPoints;
    var target = null;
    if (def.type === 'collect') {
      target = this.dropTarget();
    } else if (def.type === 'gang') {
      target = { x: -80, z: 312 }; // the middle of the Dock Rats on the pier
    } else {
      target = sp[def.target] || { x: 0, z: 0 };
    }
    this.setMarker(target.x, target.z);
  };

  MissionSystem.prototype.dropTargets = function () {
    return [
      { x: -240, z: -220, label: 'Park drop' },
      { x: 4, z: 40, label: 'Downtown drop' },
      { x: 160, z: 250, label: 'Marina drop' },
    ];
  };

  MissionSystem.prototype.dropTarget = function () {
    var d = this.dropTargets()[this.collectCount];
    return d || this.game.world.spawnPoints.lighthouse;
  };

  MissionSystem.prototype.spawnDrops = function () {
    var self = this;
    this.clearDrops();
    this.dropTargets().forEach(function (d) {
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2),
        new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x664400 }));
      mesh.position.set(d.x, 0.8, d.z);
      self.game.scene.add(mesh);
      self.drops.push({ x: d.x, z: d.z, mesh: mesh, taken: false, label: d.label });
    });
  };

  MissionSystem.prototype.clearDrops = function () {
    var self = this;
    this.drops.forEach(function (d) { self.game.scene.remove(d.mesh); });
    this.drops = [];
  };

  MissionSystem.prototype.setMarker = function (x, z) {
    this.clearMarker();
    this.markerTarget = { x: x, z: z };
    var g = new THREE.Group();
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30;
    g.add(beam);
    var diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd94a }));
    diamond.position.y = 7;
    g.add(diamond);
    var ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    // a marker on the pier sits on the deck, not under it
    var deck = (Math.abs(x + 80) < 8.5 && z > 270) ? 1.3 : 0;
    g.position.set(x, deck, z);
    this.game.scene.add(g);
    this.marker = g;
    this.markerDiamond = diamond;
    this.markerRing = ring;
  };

  MissionSystem.prototype.clearMarker = function () {
    if (this.marker) { this.game.scene.remove(this.marker); this.marker = null; }
    this.markerTarget = null;
  };

  MissionSystem.prototype.onGangDown = function () {
    if (!this.active || this.active.def.type !== 'gang') return;
    var left = this.game.peds.gangAlive();
    this.game.hud.toast(left > 0 ? (left + ' Dock Rats left') : 'Pier clear', left > 0 ? 'bad' : 'good');
    if (left === 0) this.complete();
  };

  MissionSystem.prototype.update = function (dt, player, playerCar) {
    // dialogue lines
    if (this.dialogueQueue.length > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) {
        var line = this.dialogueQueue.shift();
        this.game.hud.say(line);
        this.dialogueTimer = 4.2;
      }
    }
    if (this.markerDiamond) {
      this.markerDiamond.rotation.y += dt * 2;
      this.markerDiamond.position.y = 7 + Math.sin(performance.now() * 0.003) * 0.6;
      this.markerRing.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.12);
    }
    if (!this.active) return;
    var def = this.active.def;
    var px = player.x, pz = player.z;

    if (def.timeLimit) {
      this.missionTimer -= dt;
      this.game.hud.setTimer(this.missionTimer);
      if (this.missionTimer <= 0) {
        this.fail('Too slow — the buyer walked away.');
        return;
      }
    }

    // drops
    if (def.type === 'collect') {
      var self = this;
      this.drops.forEach(function (d) {
        if (d.taken) return;
        if (Math.hypot(d.x - px, d.z - pz) < 3) {
          d.taken = true;
          self.game.scene.remove(d.mesh);
          self.collectCount++;
          self.game.cash += 200;
          self.game.sfx.coin();
          self.game.hud.toast(d.label + ' collected (+$200) — ' + self.collectCount + '/3', 'good');
          if (self.collectCount >= 3) {
            // meet Mara beside the lighthouse (its base is solid)
            self.setMarker(self.game.world.spawnPoints.lighthouse.x + 14, self.game.world.spawnPoints.lighthouse.z + 14);
            self.game.hud.setObjective('Reach the lighthouse');
          } else {
            var next = self.dropTarget();
            self.setMarker(next.x, next.z);
          }
        }
      });
      if (this.collectCount >= 3 && this.markerTarget) {
        if (Math.hypot(this.markerTarget.x - px, this.markerTarget.z - pz) < 5) this.complete();
      }
      return;
    }

    if (def.type === 'gang') return; // completion via onGangDown

    if (def.type === 'heatEscape') {
      if (!this.active.escaped && this.game.police.stars >= def.needStars) {
        this.active.escaped = true;
        this.game.hud.toast('You\'re hot — now lose them at the hideout', 'bad');
        this.game.hud.setObjective('Lose the heat — reach the hideout');
      }
      if (this.active.escaped && this.game.police.stars === 0 && this.markerTarget) {
        if (Math.hypot(this.markerTarget.x - px, this.markerTarget.z - pz) < 6) this.complete();
      }
      return;
    }

    // driveTo
    if (this.markerTarget) {
      var d = Math.hypot(this.markerTarget.x - px, this.markerTarget.z - pz);
      this.game.hud.setDistance(d);
      if (d < 6) {
        if (def.needCar && !playerCar.active) {
          this.game.hud.toast('You need a car for this one', 'bad');
          return;
        }
        this.complete();
      }
    }
  };

  MissionSystem.prototype.complete = function () {
    var def = this.active.def;
    this.game.cash += def.reward;
    this.game.sfx.jingle();
    this.game.hud.toast('Mission complete: ' + def.title + '  +' + U.fmtCash(def.reward), 'good');
    this.game.hud.say('MARA: Clean work, Rico. ' + U.fmtCash(def.reward) + ' is yours.');
    this.clearMarker();
    this.clearDrops();
    this.game.peds.clearGang();
    this.active = null;
    this.index++;
    this.game.hud.setTimer(0);
    this.game.hud.clearObjective();
    this.game.saveGame();
    if (this.allDone()) {
      this.game.hud.showComplete();
    } else {
      var self = this;
      setTimeout(function () { self.game.hud.showNextMission(MISSIONS[self.index]); }, 2500);
    }
  };

  MissionSystem.prototype.fail = function (reason) {
    this.game.hud.toast('Mission failed: ' + reason, 'bad');
    this.game.sfx.deny();
    this.clearMarker();
    this.clearDrops();
    this.game.peds.clearGang();
    this.active = null;
    this.game.hud.setTimer(0);
    this.game.hud.clearObjective();
    var self = this;
    setTimeout(function () { self.game.hud.showNextMission(MISSIONS[self.index]); }, 2500);
  };

  MissionSystem.prototype.abort = function () {
    if (!this.active) return;
    this.clearMarker();
    this.clearDrops();
    this.game.peds.clearGang();
    this.active = null;
    this.game.hud.setTimer(0);
    this.game.hud.clearObjective();
  };

  window.SB.MISSIONS = MISSIONS;
  window.SB.MissionSystem = MissionSystem;
})();
