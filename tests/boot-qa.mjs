export default async function run(page) {
  // Fresh profile: default style is now 'auto' → cinema on first load of session
  const first = await page.evaluate(() => {
    const l = document.getElementById('loader');
    return {
      bootCinema: l ? l.dataset.bootCinema : null,
      cinemaDisplay: getComputedStyle(l.querySelector('.loader-cinema')).display,
      badge: (l.querySelector('#sequence-badge') || {}).textContent,
    };
  });
  await page.waitForTimeout(700); // let the app signal ready / loader hide

  // Reload in the SAME session → sessionStorage flag set → should fall back to Classic
  await page.reload();
  const second = await page.evaluate(() => {
    const l = document.getElementById('loader');
    return {
      bootCinema: l ? l.dataset.bootCinema : null,
      classicDisplay: getComputedStyle(l.querySelector('.loader-classic')).display,
      cinemaDisplay: getComputedStyle(l.querySelector('.loader-cinema')).display,
      sessionFlag: sessionStorage.getItem('pixeltube-boot-played'),
    };
  });

  // Force explicit '2' → cinema every time regardless of session flag
  await page.evaluate(() => localStorage.setItem('pixeltube-boot-style', '2'));
  await page.reload();
  const forced = await page.evaluate(() => {
    const l = document.getElementById('loader');
    return {
      bootCinema: l ? l.dataset.bootCinema : null,
      badge: (l.querySelector('#sequence-badge') || {}).textContent,
    };
  });
  await page.screenshot({ path: 'tests/boot-cinema.png' });

  // Reset to auto, check settings panel shows Auto as default
  await page.evaluate(() => localStorage.removeItem('pixeltube-boot-style'));
  await page.reload();
  await page.waitForTimeout(2500);
  const settingsBtn = page.locator('[data-settings-toggle]').first();
  await settingsBtn.click();
  await page.waitForTimeout(400);
  const settings = await page.evaluate(() => {
    const panel = document.querySelector('.settings-panel');
    const active = panel.querySelector('[data-settings-boot-style].active');
    return {
      hasAuto: !!panel.querySelector('[data-settings-boot-style="auto"]'),
      activeStyle: active ? active.textContent.trim() : null,
    };
  });
  await page.screenshot({ path: 'tests/boot-settings.png' });
  return { first, second, forced, settings };
}
