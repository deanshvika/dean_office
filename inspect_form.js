const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();

  await page.goto('https://secapp.taxes.gov.il/shSimulatorMas/DochSchirim20.aspx', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  await page.waitForTimeout(3000);

  const fields = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    return inputs.map(el => ({
      tag: el.tagName,
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      value: el.value,
      label: (() => {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        return lbl ? lbl.innerText.trim() : '';
      })()
    }));
  });

  console.log(JSON.stringify(fields, null, 2));

  await page.screenshot({ path: 'form_screenshot.png', fullPage: true });
  console.log('Screenshot saved.');

  await browser.close();
})();
