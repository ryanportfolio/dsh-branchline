// One capture step for capture-refs.mjs: open a screen, set it up, take shots.
// Capture every theme the product has; switch it the way the product stores it.
export default async function ({ page, shot, base }) {
  await page.goto(base + "/projects", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await shot("projects-dark");

  // Example theme switch for an app that keeps the theme in localStorage.
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  await shot("projects-light");

  // Open the dialog the chapter replicates, so its markup and spacing can be compared.
  await page.getByRole("button", { name: /new project/i }).click();
  await page.waitForTimeout(600);
  await shot("projects-new-dialog-light");
}
