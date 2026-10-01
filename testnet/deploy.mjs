import fs from 'node:fs/promises';
import {ContractFactory,Contract,Interface,keccak256,getCreateAddress,Transaction} from '../contracts/demo/deps.mjs';
import {compile} from '../contracts/demo/compile.mjs';
import {validatePlan,allowedChain,verifyDeployment,verifyCreation} from './verify.mjs';
import {args,loadKey,readJSON,rpcProvider,writeNew,runCLI} from './cli-utils.mjs';
await runCLI(async()=>{
const options=args();if(!options.plan||!options.key||!options.out)throw new Error('Required: --plan plan.json --key encrypted-borrower.json --out deployment.json');
const provider=rpcProvider();
async function exists(file){try{await fs.access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function broadcast(raw,hash){const known=await provider.getTransaction(hash);if(known)return known;return provider.broadcastTransaction(raw);}
try{
 const chain=await provider.send('eth_chainId',[]);allowedChain(BigInt(chain));
 const wallet=(await loadKey(options.key)).connect(provider),a=compile(),plan=validatePlan(await readJSON(options.plan),BigInt(chain),wallet.address);
 const draftFile=options.out+'.draft.json';let draft;
 if(options.resume==='yes')draft=await readJSON(draftFile);
 else {
  if(await exists(options.out)||await exists(draftFile))throw new Error('Output/draft exists; use --resume yes instead of overwriting');
  const factory=new ContractFactory(a.loan.abi,a.loan.evm.bytecode.object,wallet);
  const tx=await wallet.populateTransaction(await factory.getDeployTransaction(plan.terms,plan.witnesses));
  const raw=await wallet.signTransaction(tx),hash=keccak256(raw);
  draft={chainId:11155111,borrower:wallet.address,terms:plan.terms,witnesses:plan.witnesses,collateral:plan.collateral,
    loan:getCreateAddress({from:wallet.address,nonce:tx.nonce}),creationTxHash:hash,creationRaw:raw};
  await writeNew(draftFile,draft); // durable signed transaction BEFORE broadcast
 }
 const expected='0x'+a.loan.evm.bytecode.object+new Interface(a.loan.abi).encodeDeploy([plan.terms,plan.witnesses]).slice(2);
 if(draft.borrower.toLowerCase()!==wallet.address.toLowerCase()||draft.chainId!==11155111||draft.collateral!==plan.collateral)throw new Error('Resume plan/deployment mismatch');
 const prepared=Transaction.from(draft.creationRaw);
 if(prepared.chainId!==11155111n||prepared.from.toLowerCase()!==wallet.address.toLowerCase()||prepared.to!==null||prepared.value!==0n||prepared.data.toLowerCase()!==expected.toLowerCase()||getCreateAddress({from:wallet.address,nonce:prepared.nonce}).toLowerCase()!==draft.loan.toLowerCase()||keccak256(draft.creationRaw)!==draft.creationTxHash)throw new Error('Unsafe or mismatched signed creation draft');
 const creation=await broadcast(draft.creationRaw,draft.creationTxHash);
 if(creation.data.toLowerCase()!==expected.toLowerCase()||creation.from.toLowerCase()!==wallet.address.toLowerCase())throw new Error('Recorded constructor differs from plan');
 const created=await creation.wait();if(created.status!==1)throw new Error('Creation reverted');
 await verifyCreation(provider,a,draft);
 const loan=new Contract(draft.loan,a.loan.abi,wallet),openingFile=draftFile+'.opening';let openingDraft;
 if(await exists(openingFile))openingDraft=await readJSON(openingFile);
 else {
  const tx=await wallet.populateTransaction(await loan.openVault.populateTransaction({value:plan.collateral}));
  const raw=await wallet.signTransaction(tx);
  openingDraft={openTxHash:keccak256(raw),openRaw:raw};await writeNew(openingFile,openingDraft);
 }
 const preparedOpen=Transaction.from(openingDraft.openRaw);
 if(preparedOpen.chainId!==11155111n||preparedOpen.from.toLowerCase()!==wallet.address.toLowerCase()||preparedOpen.to.toLowerCase()!==draft.loan.toLowerCase()||preparedOpen.value!==BigInt(plan.collateral)||preparedOpen.data!==new Interface(a.loan.abi).encodeFunctionData('openVault')||keccak256(openingDraft.openRaw)!==openingDraft.openTxHash)throw new Error('Unsafe signed collateral draft');
 const opening=await broadcast(openingDraft.openRaw,openingDraft.openTxHash);const opened=await opening.wait();
 if(opened.status!==1)throw new Error('Collateral opening reverted; inspect transaction before replacing a signed draft');
 const manifest={chainId:11155111,borrower:wallet.address,terms:plan.terms,witnesses:plan.witnesses,collateral:plan.collateral,
    loan:draft.loan,vault:await loan.vault(),creationTxHash:draft.creationTxHash,openTxHash:openingDraft.openTxHash};
 const report=await verifyDeployment(provider,a,manifest);
 if(await exists(options.out)){
  const existing=await readJSON(options.out);if(existing.creationTxHash!==manifest.creationTxHash||existing.openTxHash!==manifest.openTxHash)throw new Error('Existing output is a different deployment');
 }else await writeNew(options.out,report.config);
 console.log(`Verified deployment saved to ${options.out}. Resume reuses signed transactions and cannot redeploy a different loan.`);
}finally{provider.destroy();}
});
