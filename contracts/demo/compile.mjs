import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import solc from 'solc';
export const contractsRoot=fileURLToPath(new URL('../',import.meta.url));
export function compile({includeSources=false}={}) {
 const resolved={},files=['src/LorrowEscrow.sol','src/FixedTermLoan.sol'];
 const sources=Object.fromEntries(files.map(p=>[p,{content:fs.readFileSync(path.join(contractsRoot,p),'utf8')}]));
 const settings={optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'],'':['ast']}}};
 const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings}),{import:p=>{
  try{const contents=fs.readFileSync(path.join(contractsRoot,'node_modules',p),'utf8');resolved[p]={content:contents};return {contents};}catch{return {error:`Missing dependency: ${p}`};}
 }}));
 const errors=(result.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const names={};function visit(node){if(!node||typeof node!=='object')return;
  if(node.nodeType==='VariableDeclaration'&&node.mutability==='immutable')names[node.id]=node.name;
  Object.values(node).forEach(v=>{if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);});
 }
 Object.values(result.sources).forEach(s=>visit(s.ast));
 const artifacts={loan:result.contracts[files[1]].FixedTermLoan,vault:result.contracts[files[0]].LorrowEscrow};
 for(const a of Object.values(artifacts))a.immutableNames=Object.fromEntries(Object.keys(a.evm.deployedBytecode.immutableReferences).map(id=>[id,names[id]]));
 if(includeSources)artifacts.standardInput={language:'Solidity',sources:{...sources,...resolved},settings};
 return artifacts;
}
