// ---- Strategy layer: objective challenges ----
// Each challenge sets an optional budget cap and a list of targets (op >= or <=) checked
// against the build's scorecard/cost. A curated brief that turns free design into a puzzle.
const CHALLENGES=[
  {id:'free',name:'Free Build (no objective)',desc:'Design whatever you like — no targets, just the cost & reliability readout.',targets:[]},
  {id:'sleeper',name:'Budget Sleeper',desc:'Real power on a shoestring. Every part counts.',budget:9000,
    targets:[{label:'Power',key:'peakHP',op:'>=',t:200,unit:'hp'},{label:'Reliability',key:'reliability',op:'>=',t:60}]},
  {id:'ppd',name:'Power per Dollar',desc:'Squeeze the most horsepower out of every $1000 spent.',
    targets:[{label:'HP per $1k',key:'hpPerK',op:'>=',t:22},{label:'Power',key:'peakHP',op:'>=',t:150,unit:'hp'}]},
  {id:'eco',name:'Eco Cruiser',desc:'Efficient and clean, but still has to move.',budget:14000,
    targets:[{label:'Thermal eff',key:'thEff',op:'>=',t:34,unit:'%'},{label:'Emissions',key:'emissions',op:'>=',t:80},{label:'Power',key:'peakHP',op:'>=',t:120,unit:'hp'}]},
  {id:'track',name:'Track Weapon',desc:'Serious power that still holds together and grades well.',budget:24000,
    targets:[{label:'Power',key:'peakHP',op:'>=',t:300,unit:'hp'},{label:'Grade',key:'grade',op:'>=',t:62},{label:'Safety',key:'safety',op:'>=',t:55}]},
  {id:'reliable',name:'Reliability Run',desc:'Bulletproof first, powerful second.',
    targets:[{label:'Reliability',key:'reliability',op:'>=',t:82},{label:'Power',key:'peakHP',op:'>=',t:180,unit:'hp'}]},
  {id:'clean',name:'Clean Machine',desc:'Emissions-legal muscle — a cat and a stoich-capable tune.',
    targets:[{label:'Emissions',key:'emissions',op:'>=',t:90},{label:'Power',key:'peakHP',op:'>=',t:150,unit:'hp'}]},
  {id:'screamer',name:'Specific-Output King',desc:'Chase the highest power per litre without grenading it.',
    targets:[{label:'HP per litre',key:'hpPerL',op:'>=',t:130},{label:'Safety',key:'safety',op:'>=',t:40}]},
  // ---- Track objectives. These judge the whole car on a circuit, so their budget covers the
  // vehicle as well as the engine, and `circuit` says which lap is being timed.
  {id:'clubsprint',name:'Club Sprint',desc:'Get round the tight club circuit inside the target on a modest budget. Grip and weight beat power here.',
    circuit:'tech',budget:40000,
    // 85 s until build 109, when grip came from tyre load in place of three stacked fitted multipliers
    // and every race-prepared car lost 5-8%. Re-set from the reference build with the margin it had (2.5%).
    // 89 s until build 111 set lateral grip to road asphalt (skidpad data); re-set the same way.
    // 94.5 until build 114 fixed the braking pass (it read the friction circle at the cornering ceiling,
    // not at the speed being solved, and braked far too early); re-set the same way.
    // Reliability 55 until build 116: the reference 2.0 turbo went 250 -> 331 hp on the same parts when the
    // valve overlap stopped reading its boost as reverse flow, and the score fell 66 -> 54 with the stress.
    targets:[{label:'Ashdown lap',key:'lap',op:'<=',t:80.5,unit:'s'},{label:'Reliability',key:'reliability',op:'>=',t:50}]},
  {id:'gppace',name:'Grand Prix Pace',desc:'A proper lap of Riverside. Balance power against the grip to use it.',
    circuit:'mixed',budget:70000,
    // 60.0 s was authored when turbo engines carried no exhaust manifold back-pressure. Once the
    // turbine was modelled the reference build cleared it by 0.29 s, inside test36's 0.5 s margin.
    // The target is authored content and has to track the physics, not the other way round.
    // Same again for the power target: charging the exhaust half of the pumping loop took the
    // reference 2JZ from 325 hp to 290, so 300 became unreachable for the build the challenge was
    // authored around. 285 restores the intent. (290 is not obviously wrong for the engine it is
    // modelled on — a JDM 2JZ-GTE was rated 276 hp.)
    // And for build 109's grip (see Club Sprint): 60.6 -> 66.0, the reference's margin (1.1%) kept.
    // Build 111's asphalt grip: 66.0 -> 70.5, the same margin. Build 114's braking-pass fix: 70.5 -> 61.2.
    targets:[{label:'Riverside lap',key:'lap',op:'<=',t:61.2,unit:'s'},{label:'Power',key:'peakHP',op:'>=',t:285,unit:'hp'}]},
  {id:'greenhell',name:'Under Seven at the Ring',desc:'20 km, 40 corners and 290 m of elevation. No budget — just go and do the time.',
    circuit:'nord',
    targets:[{label:'Nordschleife lap',key:'lap',op:'<=',t:420,unit:'s'},{label:'Reliability',key:'reliability',op:'>=',t:45}]},
  {id:'laptime$',name:'Lap per Dollar',desc:'The cheapest car that can still lap Riverside quickly. Every part has to earn its place.',
    circuit:'mixed',budget:38000,
    // 75 s until build 109's grip (see Club Sprint); the reference's 2.1% margin kept. 78.4 until build 111,
    // 83.5 until build 114, 73.0 until build 117 took the flat shift charge out and a 112 hp kei car got under.
    targets:[{label:'Riverside lap',key:'lap',op:'<=',t:70.0,unit:'s'}]}
];
let activeChallenge='free';

