import { expect, test } from "@playwright/test";

test("public policy pages have accurate metadata, draft warnings and offline navigation", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Small steps. Good days." })).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Ready for offline use", { exact: true })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const links = page.getByRole("navigation", { name: "Legal information" });
  await links.getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle("Privacy Policy | Simply Habits");
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
  const draftNotice = page.getByText("Pre-launch draft — not a finalized policy", { exact: true });
  if (await draftNotice.count()) {
    await expect(draftNotice).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/privacy$/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/privacy$/);
  await expect(page.getByText(/Account deletion requires signing in again/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(true);
  await page.getByRole("navigation", { name: "Legal information" }).getByRole("link", { name: "Terms of Service" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Terms of Service", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Terms of Service | Simply Habits");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/terms$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Terms of Service", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Legal information" }).getByRole("link", { name: "Privacy Policy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to habits", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Small steps. Good days." })).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("complete Spanish policies are public and work offline", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Ready for offline use", { exact: true })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await page.getByRole("navigation", { name: "Información legal" }).getByRole("link", { name: "Política de privacidad" }).click();
  await expect(page.locator(".legal-content")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { name: "7. Conservación y tus opciones" })).toBeVisible();
  await expect(page.getByText(/La eliminación de la cuenta requiere iniciar sesión/)).toBeVisible();
  expect(await page.locator(".legal-content section").count()).toBe(9);
  await context.setOffline(true);
  await page.getByRole("navigation", { name: "Información legal" }).getByRole("link", { name: "Condiciones del servicio" }).click();
  await expect(page.getByRole("heading", { name: "10. Dejar el servicio y resolver problemas" })).toBeVisible();
  expect(await page.locator(".legal-content section").count()).toBe(11);
  await page.reload();
  await expect(page.locator(".legal-content")).toHaveAttribute("lang", "es");
  await page.getByRole("combobox", { name: "Idioma", exact: true }).selectOption("en");
  await expect(page.getByRole("heading", { name: "10. Ending use and resolving concerns" })).toBeVisible();
});

test("privacy and terms render without JavaScript or authentication", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3100/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
    const draftNotice = page.getByText("Pre-launch draft — not a finalized policy", { exact: true });
    if (await draftNotice.count()) await expect(draftNotice).toBeVisible();
    await page.getByRole("navigation", { name: "Legal information" }).getByRole("link", { name: "Terms of Service" }).click();
    await expect(page.getByRole("heading", { name: "Terms of Service", exact: true })).toBeVisible();
  } finally { await context.close(); }
});
