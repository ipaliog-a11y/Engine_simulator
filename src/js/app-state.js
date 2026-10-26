// The default car is simply the SPORTS COUPE on its own factory fitment (CHASSIS.coupe.fit).
const DEFAULT_VEHICLE={
  chassis:'coupe',drive:'rwd',gearbox:'manual',diff:'clsd',gears:6,gearing:52,spacing:'std',
  tireType:'sport',tireWidth:245,tireAspect:40,wheelDia:18,
  aeroFront:'none',aeroRear:'lip',aeroFloor:'none',weightRed:'none',
  brakeType:'slotted',rotor:330,suspension:'sport',governor:0,limitKmh:250,tc:true
};
let vehicle=Object.assign({},DEFAULT_VEHICLE);
let perf=null;   // last computed performance result
let lapResult=null;      // last computed lap-time result
let trackKey='mixed';    // selected circuit
// Editable ECU fuel map: a λ grid (rows=load, cols=rpm). null → use the factory curve. Custom
// edits persist across rebuilds while the map-relevant engine params (below) are unchanged.
let fuelMap=null,fuelMapCustom=false,fuelMapKey='',fmSel=null;

let engine=Object.assign({},DEFAULT_ENGINE);
let buildRev=0;   // bumped each build so the dyno cache invalidates

// throttle & load are the driver inputs; rpm & map are now integrated by the sim.
let state={throttle:0.20,load:0.20,elecLoad:0.30,rpm:1000,map:0.45,afr:14.7,iat:25,coolant:90,oil:100,torque:0,powerHP:0,powerKW:0,bsfc:0,thermalEff:0,fuelFlowLph:0,knockRisk:0,ve:0.85,bmep:0,boostActual:0,batterySOC:1.0,systemVoltage:14.0,engineHealth:1.0,blown:false,wearCause:'',fuelCut:false,nitrousActive:false,nitrousCharge:1.0,emCO:0,emHC:0,emNOx:0,emPM:0,emRating:100};
let lastTime=performance.now();
let vizMode='engine';
let autoThermal=false;
let wearEnabled=true;   // WEAR toggle: off = invincible engine
let statusFlashUntil=0;
const SAVE_KEY='pixelEngineSim.setup.v2';
const APP_TAG='PixelEngineSim',APP_VER='0.5';
let dynoCache=null;
let dynoCacheKey='';
let dynoPulls=[];   // saved dyno pulls to overlay for comparison
const PULL_COLORS=['#ff66cc','#ffaa00','#66ddff','#aaff66'];

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
const otto=(cr)=>1-Math.pow(cr,-0.3);   // relative Otto-cycle efficiency (gamma≈1.3)

