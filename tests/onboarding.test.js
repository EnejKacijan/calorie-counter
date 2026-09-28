import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {onboardingStages,onboardingProgress,validateOnboardingStep,restoreOnboardingStep,onboardingProfile,onboardingSummary,completionDiagnostics} from "../public/onboarding.js";
const draft={goalType:"lose",targetWeightKg:"80",sex:"male",age:"21",heightCm:"183",weightKg:"83",activityMultiplier:"1.55",weeklyRateKg:"0.5"};
test("exactly five stages with fixed position progress for every goal",()=>{
 assert.deepEqual(onboardingStages,["Welcome","Goal","Basics","Activity","Daily target"]);
 for(const goalType of ["lose","maintain","gain"])assert.deepEqual(onboardingStages.map((_,i)=>onboardingProgress(i)),[0,25,50,75,100]);
});
for(const goalType of ["lose","maintain","gain"])test(goalType+" validates and retains the existing profile model",()=>{
 const d={...draft,goalType,...(goalType==="maintain"?{targetWeightKg:"",weeklyRateKg:""}:{})};
 for(const stage of [1,2,3])assert.deepEqual(validateOnboardingStep(stage,d),{});
 const p=onboardingProfile(d,"dark",{breakfastEnd:"11:00",lunchEnd:"16:00"});
 assert.equal(p.name,"");assert.equal(p.weightKg,83);assert.equal(p.theme,"dark");
 assert.equal(p.targetWeightKg,goalType==="maintain"?83:80);assert.equal(p.weeklyRateKg,goalType==="maintain"?0:.5);
});
test("Goal validates only its own choice, not target weight or Basics",()=>{
 assert.deepEqual(validateOnboardingStep(1,{goalType:"lose"}),{});
 for(const goalType of ["","constructor","unknown"])assert.ok(validateOnboardingStep(1,{goalType}).goalType);
});
test("all Basics answers belong to the same validation stage",()=>{
 assert.deepEqual(Object.keys(validateOnboardingStep(2,{goalType:"lose"})),["sex","age","heightCm","weightKg","targetWeightKg"]);
 assert.deepEqual(validateOnboardingStep(2,{...draft,activityMultiplier:"",weeklyRateKg:""}),{});
});
test("Maintain ignores stale hidden goal weight and pace",()=>{
 for(const stage of [1,2,3])assert.deepEqual(validateOnboardingStep(stage,{...draft,goalType:"maintain",targetWeightKg:"invalid",weeklyRateKg:"invalid"}),{});
});
for(const [key,valid,invalid]of [
 ["age",["18","100"],["17","101","18.5",""]],
 ["heightCm",["120","230"],["119","231","180.5",""]],
 ["weightKg",["35","250","83,5","83.5"],["34","251","NaN",""]],
 ["targetWeightKg",["35","250","80,5","80.5"],["34","251","NaN",""]],
])test(key+" keeps ranges and decimal/integer semantics",()=>{
 for(const v of valid)assert.deepEqual(validateOnboardingStep(2,{...draft,[key]:v}),{});
 for(const v of invalid)assert.ok(validateOnboardingStep(2,{...draft,[key]:v})[key]);
});
test("Sex remains the existing male/female calculation model",()=>{
 for(const sex of ["male","female"])assert.deepEqual(validateOnboardingStep(2,{...draft,sex}),{});
 assert.ok(validateOnboardingStep(2,{...draft,sex:"unknown"}).sex);
});
test("Activity and pace keep exactly the same choices",()=>{
 for(const activityMultiplier of ["1.2","1.375","1.55","1.725"])assert.deepEqual(validateOnboardingStep(3,{...draft,activityMultiplier}),{});
 for(const weeklyRateKg of ["0.25","0.5","0.75"])assert.deepEqual(validateOnboardingStep(3,{...draft,weeklyRateKg}),{});
 assert.ok(validateOnboardingStep(3,{...draft,weeklyRateKg:"1"}).weeklyRateKg);
});
test("old single-question drafts map to consolidated stages without changing answers",()=>{
 const before=JSON.stringify(draft);
 for(const [question,expected]of Object.entries({welcome:0,goalType:1,targetWeightKg:2,sex:2,age:2,heightCm:2,weightKg:2,activityMultiplier:3,weeklyRateKg:3,target:4}))
  assert.equal(restoreOnboardingStep({question,step:4},draft),expected);
 assert.equal(JSON.stringify(draft),before);
});
test("five-screen draft resumes immediately at its stage",()=>{
 for(let step=0;step<=4;step++)assert.equal(restoreOnboardingStep({step},draft),step);
 assert.equal(restoreOnboardingStep({step:99},draft),0);
});
test("invalid earlier answers resume at the first incomplete stage",()=>{
 assert.equal(restoreOnboardingStep({step:4},{...draft,age:"17"}),2);
 assert.equal(restoreOnboardingStep({question:"targetWeightKg"},{...draft,goalType:""}),1);
});
test("factual final summary and conditional summary remain concise",()=>{
 const a={"1.55":"Moderately active: training or active work most days."};
 assert.deepEqual(onboardingSummary(draft,a),["Lose weight · Moderately active","Male · 21 years · 183 cm · 83 kg","Goal 80 kg · 0.5 kg/week"]);
 assert.equal(onboardingSummary({...draft,goalType:"maintain"},a).length,2);
});
test("technical completion diagnostics exclude exception messages and personal values",()=>{
 const diagnostics=completionDiagnostics(Object.assign(Error("Secret user input"),{code:"local-id-unavailable"}),{location:{origin:"http://intake.test",protocol:"http:"},crypto:{getRandomValues(){}},isSecureContext:false});
 assert.equal(diagnostics.code,"local-id-unavailable");assert.equal(diagnostics.randomUUID,"undefined");
 assert.ok(!JSON.stringify(diagnostics).includes("Secret"));assert.ok(!("message" in diagnostics));
});
test("stable header/progress, local field focus, no generic error or substep UI",()=>{
 const js=readFileSync(new URL("../public/onboarding.js",import.meta.url),"utf8");
 assert.equal(js.match(/root.innerHTML =/g).length,1);
 assert.ok(!js.includes("Check the highlighted"));assert.ok(!js.includes("of 4"));assert.ok(!js.includes("scrollIntoView"));
 assert.match(js,/role="alert"/);assert.match(js,/event.repeat \|\| event.isComposing/);
 const css=readFileSync(new URL("../public/onboarding.css",import.meta.url),"utf8");
 assert.match(css,/position: fixed/);assert.match(css,/bottom: auto !important/);assert.match(css,/prefers-reduced-motion/);
});
