import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider, ContractFactory, Contract, Wallet} from 'ethers';

const sources=Object.fromEntries(['src/LorrowEscrow.sol','src/FixedTermLoan.sol','test/Mocks.sol','test/LoanRecipient.sol'].map(p=>[p,{content:fs.readFileSync(p,'utf8')}]));
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}}),{import:p=>({contents:fs.readFileSync(path.join('node_modules',p),'utf8')})}));
assert.equal((compiled.errors??[]).filter(e=>e.severity==='error').length,0,JSON.stringify(compiled.errors));
const rpc=ganache.provider({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai'},miner:{timestampIncrement:0},wallet:{deterministic:true,totalAccounts:10}});
const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
const signers=await Promise.all(Array.from({length:10},(_,i)=>provider.getSigner(i)));
const accounts=Object.values(rpc.getInitialAccounts());
const witnesses=accounts.slice(4,7).map(a=>new Wallet(a.secretKey)).sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
const borrower=await signers[1].getAddress(),lender=await signers[2].getAddress();
const opts={gasLimit:8000000};
const tx=async p=>{await(await p).wait();};
const fails=async p=>{await assert.rejects(async()=>tx(p));};
const now=async()=>BigInt((await provider.getBlock('latest')).timestamp);
async function at(t){await rpc.request({method:'evm_setTime',params:[Number(t)*1000]});await rpc.request({method:'evm_mine',params:[]});assert.equal(await now(),t);}
const art=(f,n)=>compiled.contracts[f][n];
async function deploy(f,n,args=[],value=0n,s=signers[1]){const a=art(f,n);const c=await new ContractFactory(a.abi,a.evm.bytecode.object,s).deploy(...args,{...opts,value});await c.waitForDeployment();return c;}
async function fixture(collateral=10000n,overrides={}){
 const t={lender,principal:4000n,interest:400n,duration:100n,grace:20n,fundingDeadline:await now()+50n,exitDelay:10n,approvalThreshold:2n,vetoThreshold:1n,...overrides};
 const loan=await deploy('src/FixedTermLoan.sol','FixedTermLoan',[t,witnesses.map(w=>w.address)]);
 await tx(loan.openVault({...opts,value:collateral}));
 const vault=new Contract(await loan.vault(),art('src/LorrowEscrow.sol','LorrowEscrow').abi,signers[1]);
 return {loan,vault,t,collateral};
}
async function queue(f,amount){const deadline=await now()+1000n;const [allowed,state]=await f.loan.settlementState(await f.vault.getAddress(),amount);assert.equal(allowed,true);const digest=await f.vault.settlementDigest(await f.vault.nonce()+1n,amount,state,deadline);const signatures=witnesses.slice(0,2).map(w=>w.signingKey.sign(digest).serialized);await tx(f.vault.queueSettlement(amount,deadline,signatures,opts));}
async function finish(f,amount){await queue(f,amount);await at((await f.vault.pending()).readyAt);await tx(f.vault.executeSettlement(opts));assert.equal(await f.vault.credit(lender),amount);assert.equal(await f.vault.credit(borrower),f.collateral-amount);}
let checks=0;const pass=s=>console.log(`LOAN PASS ${++checks}: ${s}`);
{
 const f=await fixture();
 await fails(f.loan.openVault({...opts,value:10000n}));
 await fails(f.loan.connect(signers[3]).fund({...opts,value:4000n}));
 await fails(f.loan.connect(signers[2]).fund({...opts,value:3999n}));
 await fails(f.loan.repay({...opts,value:4400n}));
 await tx(f.loan.connect(signers[2]).fund({...opts,value:4000n}));
 await fails(f.loan.connect(signers[2]).fund({...opts,value:4000n}));
 assert.equal(await f.loan.paymentCredit(borrower),4000n);
 await tx(f.loan.claimPayment(opts));await fails(f.loan.claimPayment(opts));
 pass('named parties, exact one-time funding, principal claim once');
 await fails(f.loan.connect(signers[3]).repay({...opts,value:4400n}));
 await fails(f.loan.repay({...opts,value:4399n}));
 await fails(f.loan.repay({...opts,value:4401n}));
 await tx(f.loan.repay({...opts,value:4400n}));await fails(f.loan.repay({...opts,value:4400n}));
 assert.equal(await f.loan.paymentCredit(lender),4400n);
 assert.equal((await f.loan.settlementState(await f.vault.getAddress(),4400n))[0],false);
 await queue(f,0n);
 // Claiming repayment changes no policy authorization state.
 await tx(f.loan.connect(signers[2]).claimPayment(opts));
 await fails(f.loan.connect(signers[2]).claimPayment(opts));
 await fails(f.vault.executeSettlement(opts));
 await at((await f.vault.pending()).readyAt);await tx(f.vault.executeSettlement(opts));
 assert.equal(await f.vault.credit(borrower),10000n);
 await tx(f.vault.claim(opts));
 assert.equal(BigInt(await rpc.request({method:'eth_getBalance',params:[await f.loan.getAddress(),'latest']})),0n);
 pass('DEMO repayment: debt paid, lender claims payment, full collateral returned after delay');
}
{
 const f=await fixture();await tx(f.loan.connect(signers[2]).fund({...opts,value:4000n}));
 const end=await f.loan.dueAt()+20n;
 await at(end);assert.equal((await f.loan.settlementState(await f.vault.getAddress(),4400n))[0],false);
 await tx(f.loan.repay({...opts,value:4400n}));
 await at(end+1n);assert.equal((await f.loan.settlementState(await f.vault.getAddress(),4400n))[0],false);
 pass('repayment accepted at exact grace endpoint; repaid loan never defaults');
}
{
 const f=await fixture();await tx(f.loan.connect(signers[2]).fund({...opts,value:4000n}));
 await tx(f.loan.claimPayment(opts));
 const end=await f.loan.dueAt()+20n;await at(end);
 assert.equal((await f.loan.settlementState(await f.vault.getAddress(),4400n))[0],false);
 await at(end+1n);await fails(f.loan.repay({...opts,value:4400n}));
 for(const wrong of [0n,4399n,4401n,10000n])assert.equal((await f.loan.settlementState(await f.vault.getAddress(),wrong))[0],false);
 assert.equal((await f.loan.settlementState(borrower,4400n))[0],false);
 // Even an actual witness quorum cannot authorize excess recovery.
 const deadline=await now()+1000n;
 const [,state]=await f.loan.settlementState(await f.vault.getAddress(),10000n);
 const digestBad=await f.vault.settlementDigest(await f.vault.nonce()+1n,10000n,state,deadline);
 await fails(f.vault.queueSettlement(10000n,deadline,witnesses.slice(0,2).map(w=>w.signingKey.sign(digestBad).serialized),opts));
 await queue(f,4400n);await fails(f.vault.executeSettlement(opts));
 const digest=await f.vault.vetoDigest(await f.vault.nonce());
 await tx(f.vault.veto([witnesses[0].signingKey.sign(digest).serialized],opts));
 await fails(f.vault.executeSettlement(opts));
 await finish(f,4400n);
 await tx(f.vault.connect(signers[2]).claim(opts));await tx(f.vault.claim(opts));
 pass('DEMO default: grace enforced, veto and fresh delay, debt capped at 4400, surplus 5600 returned');
}
{
 const f=await fixture();await at(f.t.fundingDeadline);
 assert.equal((await f.loan.settlementState(await f.vault.getAddress(),0n))[0],false);
 await tx(f.loan.connect(signers[2]).fund({...opts,value:4000n}));
 assert.equal(await f.loan.dueAt(),f.t.fundingDeadline+100n);
 pass('funding at exact deadline sets maturity from actual funding');
}
{
 const f=await fixture();await at(f.t.fundingDeadline+1n);
 await fails(f.loan.connect(signers[2]).fund({...opts,value:4000n}));
 assert.equal((await f.loan.settlementState(await f.vault.getAddress(),1n))[0],false);
 await finish(f,0n);await tx(f.vault.claim(opts));
 pass('DEMO unfunded expiry: principal cannot arrive late; all collateral returned');
}
{
 const t={lender,principal:4000n,interest:400n,duration:100n,grace:20n,fundingDeadline:await now()+50n,exitDelay:10n,approvalThreshold:2n,vetoThreshold:1n};
 const loan=await deploy('src/FixedTermLoan.sol','FixedTermLoan',[t,witnesses.map(w=>w.address)]);
 await fails(loan.connect(signers[3]).openVault({...opts,value:10000n}));
 await fails(loan.openVault({...opts,value:4399n}));
 await fails(loan.connect(signers[2]).fund({...opts,value:4000n}));
 await at(t.fundingDeadline+1n);await fails(loan.openVault({...opts,value:10000n}));
 pass('only borrower locks adequate collateral before deadline; no unsecured funding');
}
{
 for(let i=0;i<12;i++){
  const p=100n+BigInt(i*31), interest=BigInt(i*7), c=p+interest+BigInt(i*97);
  const f=await fixture(c,{principal:p,interest});
  await tx(f.loan.connect(signers[2]).fund({...opts,value:p}));
  if(i%2===0){await tx(f.loan.repay({...opts,value:p+interest}));await finish(f,0n);}
  else{await at(await f.loan.dueAt()+21n);await finish(f,p+interest);}
  assert.equal(await f.vault.credit(lender)+await f.vault.credit(borrower),c);
 }
 pass('12 varied loans conserve collateral, including zero interest and zero surplus');
}
{
 const recipient=await deploy('test/LoanRecipient.sol','LoanRecipient');
 const f=await fixture(10000n,{lender:await recipient.getAddress()});
 await tx(recipient.fund(await f.loan.getAddress(),{...opts,value:4000n}));
 await tx(f.loan.repay({...opts,value:4400n}));
 await tx(recipient.configure(await f.loan.getAddress(),true,false,opts));
 await fails(recipient.claim(opts));assert.equal(await f.loan.paymentCredit(await recipient.getAddress()),4400n);
 await tx(f.loan.claimPayment(opts)); // Other beneficiary can still withdraw principal.
 await tx(recipient.configure(await f.loan.getAddress(),false,true,opts));
 await tx(recipient.claim(opts));assert.equal(await recipient.attempted(),true);
 assert.equal(await f.loan.paymentCredit(await recipient.getAddress()),0n);
 await fails(recipient.claim(opts));
 pass('rejecting payment recipient retains credit; reentrancy cannot double claim or block counterparty');
}
for(const [file,name] of [['src/LorrowEscrow.sol','LorrowEscrow'],['src/FixedTermLoan.sol','FixedTermLoan']]){
 const size=art(file,name).evm.deployedBytecode.object.length/2;assert(size<24576);console.log(`${name} runtime: ${size} bytes`);
}
await rpc.disconnect();console.log(`Complete: ${checks} loan scenario groups passed.`);
