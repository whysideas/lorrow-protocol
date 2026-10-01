import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider, ContractFactory, Wallet, TypedDataEncoder, keccak256, toUtf8Bytes} from 'ethers';

const sources = Object.fromEntries(['src/LorrowEscrow.sol','test/Mocks.sol'].map(p=>[p,{content:fs.readFileSync(p,'utf8')}]));
const compiled = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{
    optimizer:{enabled:true,runs:200}, evmVersion:'shanghai',
    outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}
}}), {import:p=>{try{return {contents:fs.readFileSync(path.join('node_modules',p),'utf8')}}catch{return {error:`Missing ${p}`}}}}));
const errors = (compiled.errors??[]).filter(e=>e.severity==='error');
assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/compiled.json',JSON.stringify(compiled.contracts,null,2));
const rpc = ganache.provider({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:12}});
const provider = new BrowserProvider(rpc,undefined,{cacheTimeout:-1}); provider.pollingInterval=10;
const accounts = Object.values(rpc.getInitialAccounts());
const signers = await Promise.all(accounts.map((_,i)=>provider.getSigner(i)));
const witnesses=accounts.slice(4,7).map(a=>new Wallet(a.secretKey)).sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
const stranger=new Wallet(accounts[8].secretKey);
const borrower=await signers[1].getAddress(), lender=await signers[2].getAddress();
const terms=keccak256(toUtf8Bytes('TEST TERMS ONLY: no economic policy implemented'));
const amount=10000n, delay=30n;
let count=0;
const log=name=>{count++;console.log(`PASS ${count}: ${name}`)};
const artifact=(file,name)=>compiled.contracts[file][name];
async function deploy(file,name,args=[],value=0n){const a=artifact(file,name); const c=await new ContractFactory(a.abi,a.evm.bytecode.object,signers[0]).deploy(...args,{value,gasLimit:8000000});await c.waitForDeployment();return c;}
async function tx(p){await (await p).wait();}
async function fails(p){await assert.rejects(async()=>await tx(p));}
async function balance(addr){return BigInt(await rpc.request({method:'eth_getBalance',params:[addr,'latest']}));}
const opts={gasLimit:2000000};
async function now(){return BigInt((await provider.getBlock('latest')).timestamp);}
async function advance(n=31){await rpc.request({method:'evm_increaseTime',params:[n]});await rpc.request({method:'evm_mine',params:[]});}
async function fixture(b=borrower,l=lender){const p=await deploy('test/Mocks.sol','MockPolicy');const v=await deploy('src/LorrowEscrow.sol','LorrowEscrow',[b,l,await p.getAddress(),terms,witnesses.map(w=>w.address),2,1,delay],amount);return {p,v};}
function rawSign(w,digest){return w.signingKey.sign(digest).serialized;}
async function approval(v,p,x,deadline,nonce){
 const stateHash=await p.stateHash(); const next=nonce??((await v.nonce())+1n);
 const domain={name:'LorrowEscrow',version:'0.0.1',chainId:31337,verifyingContract:await v.getAddress()};
 const types={Settlement:[{name:'nonce',type:'uint256'},{name:'lenderAmount',type:'uint256'},{name:'stateHash',type:'bytes32'},{name:'deadline',type:'uint256'},{name:'termsHash',type:'bytes32'}]};
 const data={nonce:next,lenderAmount:x,stateHash,deadline,termsHash:terms};
 const digest=TypedDataEncoder.hash(domain,types,data);
 assert.equal(digest,await v.settlementDigest(next,x,stateHash,deadline));
 return witnesses.slice(0,2).map(w=>rawSign(w,digest));
}
async function queue(v,p,x=4000n){const deadline=await now()+3600n;const sigs=await approval(v,p,x,deadline);await tx(v.queueSettlement(x,deadline,sigs,opts));return {deadline,sigs};}

{
 const {v,p}=await fixture();
 await fails(v.executeSettlement(opts));log('execution without a proposal rejected');
 const deadline=await now()+3600n, sigs=await approval(v,p,4000n,deadline);
 await fails(v.queueSettlement(4000n,deadline,[sigs[0]],opts));log('insufficient quorum rejected');
 await fails(v.queueSettlement(4000n,deadline,[sigs[0],sigs[0]],opts));log('duplicate signer rejected');
 await fails(v.queueSettlement(4000n,deadline,[...sigs].reverse(),opts));log('unsorted signer list rejected');
 const digest=await v.settlementDigest(1,4000n,await p.stateHash(),deadline);
 await fails(v.queueSettlement(4000n,deadline,[rawSign(stranger,digest),sigs[0]],opts));log('unknown signer rejected');
 await fails(v.queueSettlement(4001n,deadline,sigs,opts));log('approval cannot authorize a different amount');
 await fails(v.queueSettlement(amount+1n,deadline,await approval(v,p,amount+1n,deadline),opts));log('collateral over-allocation rejected');
 await fails(v.queueSettlement(4000n,await now()+1n,sigs,opts));log('deadline shorter than exit delay rejected');
 const other=await fixture();
 await fails(other.v.queueSettlement(4000n,deadline,sigs,opts));log('cross-vault signature replay rejected');
 const badDomain=TypedDataEncoder.hash({name:'LorrowEscrow',version:'0.0.1',chainId:1,verifyingContract:await v.getAddress()},
 {Settlement:[{name:'nonce',type:'uint256'},{name:'lenderAmount',type:'uint256'},{name:'stateHash',type:'bytes32'},{name:'deadline',type:'uint256'},{name:'termsHash',type:'bytes32'}]},
 {nonce:1,lenderAmount:4000n,stateHash:await p.stateHash(),deadline,termsHash:terms});
 await fails(v.queueSettlement(4000n,deadline,witnesses.slice(0,2).map(w=>rawSign(w,badDomain)),opts));log('cross-chain signature replay rejected');
 await tx(v.queueSettlement(4000n,deadline,sigs,opts));
 await fails(v.executeSettlement(opts));log('execution before delay rejected');
 await fails(v.queueSettlement(4000n,deadline,sigs,opts));log('second pending proposal rejected');
 await fails(v.clearInvalid(opts));log('unexpired valid proposal cannot be cleared arbitrarily');
 await advance();await tx(v.executeSettlement(opts));
 assert.equal(await v.credit(borrower),6000n);assert.equal(await v.credit(lender),4000n);log('exact allocation and borrower remainder');
 await fails(v.executeSettlement(opts));await fails(v.queueSettlement(4000n,deadline,sigs,opts));log('settlement cannot execute or queue twice');
 await fails(v.connect(signers[3]).claim(opts));log('third-party withdrawal rejected');
 await tx(v.connect(signers[1]).claim(opts));await fails(v.connect(signers[1]).claim(opts));await tx(v.connect(signers[2]).claim(opts));
 assert.equal(await balance(await v.getAddress()),0n);log('claims consume credits once and exhaust original collateral');
}
{
 const {p,v}=await fixture();const {deadline,sigs}=await queue(v,p);
 const vetoSig=rawSign(witnesses[0],await v.vetoDigest(1));
 await tx(v.veto([vetoSig],opts));assert.equal(await v.nonce(),1n);assert.equal(await balance(await v.getAddress()),amount);
 await fails(v.executeSettlement(opts));await fails(v.queueSettlement(4000n,deadline,sigs,opts));log('veto keeps assets in vault and invalidates approval nonce');
 await queue(v,p);await fails(v.veto([vetoSig],opts));log('old veto cannot cancel a newer proposal');
 await advance();await tx(v.executeSettlement(opts));log('fresh quorum can proceed after veto with a new delay');
}
{
 const {p,v}=await fixture();await tx(p.set(false,await p.stateHash(),amount,opts));
 const deadline=await now()+3600n;
 await fails(v.queueSettlement(4000n,deadline,await approval(v,p,4000n,deadline),opts));log('even valid quorum cannot override policy rejection');
 await tx(p.set(true,await p.stateHash(),3000,opts));
 await fails(v.queueSettlement(4000n,deadline,await approval(v,p,4000n,deadline),opts));log('policy lender cap enforced at proposal');
}
{
 const {p,v}=await fixture();await queue(v,p);await tx(p.set(true,keccak256(toUtf8Bytes('repayment changed state')),amount,opts));await advance();
 await fails(v.executeSettlement(opts));await tx(v.clearInvalid(opts));log('changed policy state invalidates pending authorization');
 await queue(v,p,0n);await advance();await tx(v.executeSettlement(opts));assert.equal(await v.credit(borrower),amount);log('repayment-shaped zero-lender allocation returns all collateral');
}
{
 const {p,v}=await fixture();await queue(v,p);await tx(p.set(false,await p.stateHash(),amount,opts));await advance();
 await fails(v.executeSettlement(opts));await tx(v.clearInvalid(opts));log('policy approval rechecked at execution');
}
{
 const {p,v}=await fixture();await queue(v,p);await advance(3601);await fails(v.executeSettlement(opts));await tx(v.clearInvalid(opts));log('expired approval cannot execute and can be cleared');
}
{
 const recipient=await deploy('test/Mocks.sol','ReentrantRecipient');const {p,v}=await fixture(await recipient.getAddress());await tx(recipient.setVault(await v.getAddress(),opts));await queue(v,p,0n);await advance();await tx(v.executeSettlement(opts));await tx(recipient.claim(opts));
 assert.equal(await recipient.attempted(),true);assert.equal(await v.credit(await recipient.getAddress()),0n);assert.equal(await balance(await v.getAddress()),0n);log('recipient reentrancy cannot duplicate payout');
}
{
 const recipient=await deploy('test/Mocks.sol','RejectingRecipient');const {p,v}=await fixture(await recipient.getAddress());await queue(v,p);await advance();await tx(v.executeSettlement(opts));
 await fails(recipient.claim(await v.getAddress(),opts));assert.equal(await v.credit(await recipient.getAddress()),6000n);
 await tx(v.connect(signers[2]).claim(opts));assert.equal(await balance(await v.getAddress()),6000n);log('rejecting recipient retains its credit without blocking counterparty claim');
}
{
 const {p,v}=await fixture();await deploy('test/Mocks.sol','ForceETH',[await v.getAddress()],777n);await queue(v,p);await advance();await tx(v.executeSettlement(opts));
 assert.equal(await v.credit(borrower)+await v.credit(lender),amount);await tx(v.connect(signers[1]).claim(opts));await tx(v.connect(signers[2]).claim(opts));assert.equal(await balance(await v.getAddress()),777n);log('forced ETH cannot inflate allocations; unsolicited donation remains outside loan accounting');
}
// Deterministic seeded sampling of allocations and veto/donation/claim order paths.
let seed=0x10ab;
for(let i=0;i<24;i++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=BigInt(seed)% (amount+1n);
 const {p,v}=await fixture();if(i%3===0)await deploy('test/Mocks.sol','ForceETH',[await v.getAddress()],123n);
 await queue(v,p,x);if(i%4===0){await tx(v.veto([rawSign(witnesses[0],await v.vetoDigest(1))],opts));await queue(v,p,x);}
 await advance();await tx(v.executeSettlement(opts));assert.equal(await v.credit(borrower)+await v.credit(lender),amount);
 const order=i%2===0?[1,2]:[2,1];for(const j of order){const addr=await signers[j].getAddress();if(await v.credit(addr)>0n)await tx(v.connect(signers[j]).claim(opts));}
 assert.equal(await balance(await v.getAddress()),i%3===0?123n:0n);
}
log('24 seeded sampled settlement sequences preserve allocation and balance conservation');
const bytecodeBytes=artifact('src/LorrowEscrow.sol','LorrowEscrow').evm.deployedBytecode.object.length/2;
const summary={compiler:solc.version(),evm:'shanghai',checks:count,sampledSequences:24,runtimeBytecodeBytes:bytecodeBytes,note:'Local EVM smoke tests with a mock policy; no formal verification, production policy, or safety certification.'};
fs.writeFileSync('test-results.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
await rpc.disconnect();
