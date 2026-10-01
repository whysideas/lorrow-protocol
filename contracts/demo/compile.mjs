import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import solc from 'solc';
export const contractsRoot = fileURLToPath(new URL('../', import.meta.url));
export function compile() {
  const files=['src/LorrowEscrow.sol','src/FixedTermLoan.sol'];
  const sources=Object.fromEntries(files.map(p=>[p,{content:fs.readFileSync(path.join(contractsRoot,p),'utf8')}]));
  const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{
    optimizer:{enabled:true,runs:200},evmVersion:'shanghai',
    outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}
  }}),{import:p=>{try{return {contents:fs.readFileSync(path.join(contractsRoot,'node_modules',p),'utf8')}}catch{return {error:`Missing dependency: ${p}`}}}}));
  const errors=(result.errors??[]).filter(e=>e.severity==='error');
  if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
  return {loan:result.contracts[files[1]].FixedTermLoan,vault:result.contracts[files[0]].LorrowEscrow};
}
