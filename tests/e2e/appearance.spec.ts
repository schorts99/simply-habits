import { expect, test } from "@playwright/test";

test("system appearance updates on habits, insights and public legal pages", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New habit", exact: true })).toBeVisible();
  for (const view of ["My habits", "My progress"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByRole("combobox", { name: "Language" })).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
});

test("dark primary buttons meet text contrast requirements normally and on hover", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const button = page.getByRole("button", { name: "New habit", exact: true });
  await expect(button).toBeVisible();
  const contrast = () => button.evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        .map(value => value / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
  await button.hover();
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
});

test("English-first devices do not switch to secondary Spanish", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "languages", { get: () => ["en-US", "es-MX"] }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Small steps. Good days." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
