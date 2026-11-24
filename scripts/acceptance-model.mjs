// Extract only model/endpoint identifiers from observed request JSON; never
// persist authorization headers, user prompts, cookies or the full payload.
export function requestModelEvidence(payload) {
  const models=new Set(),endpoints=new Set();
  function visit(value,depth=0){
    if(!value||typeof value!=="object"||depth>4)return;
    for(const [key,item]of Object.entries(value)){
      if(key==="model"&&typeof item==="string")models.add(item);
      else if(key==="endpoint"&&typeof item==="string")endpoints.add(item);
      else if(["endpointOption","conversation","ephemeralAgent","modelOptions","options"].includes(key))visit(item,depth+1);
    }
  }
  visit(payload);
  return {models:[...models],endpoints:[...endpoints]};
}
