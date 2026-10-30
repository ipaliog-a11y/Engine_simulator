// ====== SERIES: the engine only charges (build 193, step 3.4 of plans/hybrid-electric/) ======
// The third HYBRID layout, Nissan's e-POWER (the Note since 2016, the Qashqai since 2022) and the range extenders: the
// wheels are driven by the traction motor alone, through one reduction, as an electric car's; the engine turns a
// generator on its crank and nothing else. So its speed is free at any road speed (the controller holds it on its best
// line, src/js/power-split.js psOol), its power reaches the wheels only as electricity (through the generator's and the
// motor's losses, each its own machine's), and it can stop whenever the pack can drive. What this costs, against a
// power-split: every kilowatt goes through both machines; what it gains: no mechanical path to tie the engine to the
// road. It shares the power-split's code: the vehicle sees one reduction from the motor (POWERSPLIT in powertrain.js),
// the energy manager, the lap's fuel and the bench treat the generator as MG1 with the whole of the engine's torque
// on it and none to the wheels (hybGear: ks 1, kr 0).
// What is a rule, and named: the generator is built from the traction motor's design (as a power-split's MG1 is), for
// 110% of the engine's peak torque and 105% of its peak power, turning to 5% past the engine's redline.
const SERIES={genMargin:1.1,genPower:1.05,genOver:1.05};
const isSeries=()=>isHybrid()&&engine.hy.mode==='series';
function seriesGenBuild(e,mot,V){
  return hybMachineFrom(mot,SERIES.genMargin*e.score.peakTQ,SERIES.genPower*e.score.peakHP*745.7,V,Math.round(e.redline*SERIES.genOver));
}
const SERIES_REDUCTION={label:'SINGLE-SPEED (SERIES)',shift:0,powershift:true,eff:1,stall:0,mult:1,cost:700};
const SERIES_GEAR_NOTE='A series hybrid has no gears: one reduction from its traction motor, set with GEARING on the VEHICLE tab.';
// The driveline line of the VEHICLE summary for a series hybrid.
function seriesDrivelineLine(v){
  const hy=engine.hy,V=hybBusV(hy);
  return '<br>'+tr('SINGLE-SPEED (SERIES)')+' • '+tr('Reduction')+' <b>'+v.finalDrive.toFixed(2)+':1</b> ('+tr('matched')+' '+v.reductionMatched.toFixed(2)+':1) • '+
    tr('generator')+' '+Math.round(motorMaxTorque(hy.mg1,100,V,60))+' Nm • '+tr('motor')+' '+Math.round(motorMaxTorque(hy.motor,100,V,60))+' Nm';
}
