import {Wallet} from '../contracts/demo/deps.mjs';
import {args,password,writeNew,runCLI} from './cli-utils.mjs';
await runCLI(async()=>{
const options=args(),directory=options.dir??'.lorrow/keys';
const pass=await password('New keystore password (input hidden): ');
if(pass.length<12)throw new Error('Use at least 12 characters');
if(!process.env.LORROW_KEY_PASSWORD&&pass!==await password('Confirm password: '))throw new Error('Passwords differ');
if(options.single){const wallet=Wallet.createRandom();await writeNew(options.single,JSON.parse(await wallet.encrypt(pass)));console.log(`Encrypted testnet key: ${wallet.address} → ${options.single}`);process.exit(0);}
const witnesses=[];
for(let i=1;i<=3;i++){
 const wallet=Wallet.createRandom(),file=`${directory}/witness-${i}.json`;
 await writeNew(file,JSON.parse(await wallet.encrypt(pass)));witnesses.push(wallet.address);
 console.log(`Witness ${i}: ${wallet.address} → ${file}`);
}
await writeNew(`${directory}/committee.json`,{chainId:11155111,witnesses:witnesses.sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)});
console.log('Encrypted testnet witness keys created. Their public addresses need no ETH to sign. Keep these files and journals backed up privately.');
});
