import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {compile,contractsRoot} from '../contracts/demo/compile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildSite(directory=path.join(root,'.lorrow','site')) {
 const compiled=compile({includeSources:true});
 const files=['app/testnet.js','app/style.css','testnet/verify.mjs','witness/model.mjs','witness/read-chain.mjs'];
 await fs.mkdir(directory,{recursive:true});
 for(const f of files){await fs.mkdir(path.dirname(path.join(directory,f)),{recursive:true});await fs.copyFile(path.join(root,f),path.join(directory,f));}
 await fs.copyFile(path.join(root,'app/testnet.html'),path.join(directory,'index.html'));
 await fs.mkdir(path.join(directory,'vendor'),{recursive:true});
 await fs.copyFile(path.join(contractsRoot,'node_modules/ethers/dist/ethers.min.js'),path.join(directory,'vendor/ethers.js'));
 await fs.copyFile(path.join(contractsRoot,'node_modules/ethers/LICENSE.md'),path.join(directory,'vendor/LICENSE.ethers.md'));
 await fs.mkdir(path.join(directory,'contracts/demo'),{recursive:true});
 await fs.writeFile(path.join(directory,'contracts/demo/deps.mjs'),"export * from '../../vendor/ethers.js';\n");
 await fs.writeFile(path.join(directory,'artifacts.json'),JSON.stringify({loan:compiled.loan,vault:compiled.vault}));
 await fs.writeFile(path.join(directory,'solidity-standard-input.json'),JSON.stringify(compiled.standardInput));
 return {directory,artifacts:{loan:compiled.loan,vault:compiled.vault}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await buildSite(process.argv[2]);console.log(`Static testnet interface built at ${result.directory}`);}
