import test from "node:test";
import assert from "node:assert/strict";
import {requestModelEvidence} from "../scripts/acceptance-model.mjs";

test("Observed model evidence includes routing identifiers without prompt or credentials",()=>{
  const evidence=requestModelEvidence({text:"secret prompt",headers:{Authorization:"secret"},model:"gpt-6.1-sol",endpointOption:{model:"gpt-6.1-sol",endpoint:"Oproxy OpenAI"}});
  assert.deepEqual(evidence,{models:["gpt-6.1-sol"],endpoints:["Oproxy OpenAI"]});
  assert.ok(!JSON.stringify(evidence).includes("secret"));
});
test("Conflicting or absent model identifiers cannot masquerade as required model evidence",()=>{
  assert.deepEqual(requestModelEvidence({model:"gpt-6.1-sol",endpointOption:{model:"gpt-5.6-sol",endpoint:"Oproxy OpenAI"}}).models,["gpt-6.1-sol","gpt-5.6-sol"]);
  assert.deepEqual(requestModelEvidence({text:"Use gpt-6.1-sol"}),{models:[],endpoints:[]});
});
