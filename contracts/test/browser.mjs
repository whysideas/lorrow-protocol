// Optional browser QA. CI installs pinned Playwright separately; walkthrough users
// need only the contract dependencies, not a browser automation package.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createWalkthrough} from '../demo/server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.LORROW_PLAYWRIGHT_MODULE??'playwright');
const app=await createWalkthrough({port:0});let browser;
const output=new URL('../artifacts/',import.meta.url);await fs.mkdir(output,{recursive:true});
try {
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.url);await page.getByText('Awaiting funding',{exact:true}).waitFor();
 await page.screenshot({path:new URL('walkthrough-desktop.png',output).pathname,fullPage:true});
 async function click(action){
  const b=page.locator(`[data-action="${action}"]`);await b.click();
  await page.waitForFunction(()=>!document.getElementById('notice').textContent.includes('Processing'));
  assert.equal(await page.locator('#notice').evaluate(el=>el.classList.contains('error')),false,await page.locator('#notice').textContent());
 }
 await click('fund');await click('claimPrincipal');await click('repay');await click('claimRepayment');await click('approve');await click('queue');
 assert.equal(await page.locator('[data-action="execute"]').isDisabled(),true);
 await click('advanceDelay');await click('execute');await click('claimBorrower');
 assert.equal(await page.locator('#phase').textContent(),'Settled');assert.equal(await page.locator('#borrower-credit').textContent(),'0.0 ETH');
 await click('reset');await page.locator('[data-path="default"]').click();await click('fund');await click('claimPrincipal');await click('advanceDefault');
 await page.locator('.checks summary').click();await click('rejectExcess');assert.equal(await page.getByText('Refused',{exact:true}).count(),3);
 await click('approve');await click('queue');await click('veto');await click('approve');await click('queue');await click('advanceDelay');await click('execute');
 assert.equal(await page.locator('#borrower-credit').textContent(),'1.9 ETH');assert.equal(await page.locator('#lender-credit').textContent(),'1.1 ETH');
 await click('claimLender');await click('claimBorrower');
 await page.screenshot({path:new URL('walkthrough-default.png',output).pathname,fullPage:true});
 await click('reset');await page.locator('[data-path="expiry"]').click();await click('expireFunding');await click('approve');await click('queue');
 await click('expireProposal');await click('clear');await click('approve');await click('queue');await click('advanceDelay');await click('execute');await click('claimBorrower');
 assert.equal(await page.locator('#phase').textContent(),'Settled');
 await click('reset');await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:new URL('walkthrough-mobile.png',output).pathname,fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout overflows viewport');
 await page.locator('[data-path="expiry"]').focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await page.locator('[data-path="default"]').getAttribute('aria-selected'),'true');
 assert.deepEqual(errors,[]);
 console.log('Browser PASS: repayment, default, expiry, rejected payout, veto/requeue, expired proposal, mobile width, keyboard tabs, no page errors');
} finally {await browser?.close();await app.close();}
