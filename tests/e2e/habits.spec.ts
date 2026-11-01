import { test, expect } from "@playwright/test";

test("select chevrons have the same inset as their labels in both themes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.getByRole("combobox", { name: "Appearance" }).selectOption(theme);
    for (const select of await page.locator(".field select").all()) {
      const styles = await select.evaluate(element => {
        const style = getComputedStyle(element);
        return { left: style.paddingLeft, inset: style.getPropertyValue("--select-inset").trim(), arrow: style.backgroundImage, appearance: style.appearance, position: style.backgroundPosition, repeat: style.backgroundRepeat };
      });
      expect(styles.inset).toBe(styles.left);
      expect(styles.arrow).toContain("data:image/svg+xml");
      expect(styles.appearance).toBe("none");
      expect(styles.position).toBe(`calc(100% - ${styles.left}) 50%`);
      expect(styles.repeat).toBe("no-repeat");
    }
  }
});

test("create, check in, undo, edit, archive/restore, export and offline persistence", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Small steps. Good days." })).toBeVisible();
  await page.getByRole("button", { name: "New habit", exact: true }).click();
  await page.getByRole("textbox", { name: "Habit name", exact: true }).fill("Launch verification habit");
  await page.getByRole("spinbutton", { name: "Daily target" }).fill("2");
  await page.getByRole("textbox", { name: "Unit", exact: true }).fill("glasses");
  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch verification habit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check in Launch verification habit", exact: true }).click();
  await expect(page.locator(".habit-progress")).toContainText("1 / 2 glasses");
  await page.getByRole("button", { name: "Check in Launch verification habit", exact: true }).click();
  await expect(page.locator(".daily-progress > p")).toContainText("1 of 1 habits complete");
  await page.reload();
  await expect(page.locator(".daily-progress > p")).toContainText("1 of 1 habits complete");
  await page.getByRole("button", { name: "Undo check-in for Launch verification habit", exact: true }).click();
  await expect(page.locator(".daily-progress > p")).toContainText("0 of 1 habits complete");
  await page.getByRole("button", { name: "Edit Launch verification habit", exact: true }).click();
  await page.getByRole("textbox", { name: "Habit name", exact: true }).fill("A verified little habit");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A verified little habit", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search habits", exact: true }).fill("no matching habit");
  await expect(page.getByText("Nothing here just yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("button", { name: "Edit A verified little habit", exact: true }).click();
  await page.getByRole("button", { name: "Archive habit", exact: true }).click();
  await page.getByRole("button", { name: "Yes, archive this habit", exact: true }).click();
  await expect(page.locator(".habit-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("No habits on pause.", { exact: false })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my habits", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(buffers).toString());
  expect(exported.habits[0].name).toBe("A verified little habit");
  expect(Object.values(exported.habits[0].entries)).toEqual([expect.objectContaining({ count: 1, target: 2 })]);
  await expect(page.getByText("Ready for offline use", { exact: true })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "A verified little habit", exact: true })).toBeVisible();
  await expect(page.getByText(/offline.*Keep going/i)).toBeVisible();
  await page.getByRole("button", { name: "Check in A verified little habit", exact: true }).click();
  await expect(page.locator(".daily-progress > p")).toContainText("1 of 1 habits complete");
  await page.getByRole("button", { name: "New habit", exact: true }).click();
  await page.getByRole("textbox", { name: "Habit name", exact: true }).fill("Created entirely offline");
  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  await expect(page.locator(".habit-card")).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Created entirely offline", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "My progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your consistency garden", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("SEO, PWA assets, opt-in notification states, no automatic permission request", async ({ page, request }) => {
  await page.addInitScript(() => {
    let requests = 0;
    const original = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = () => { requests++; return original(); };
    Object.defineProperty(window, "__permissionRequests", { get: () => requests });
  });

  await page.goto("/");
  await expect(page).toHaveTitle("Simply Habits — Offline Habit Tracker");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/social-cover\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  expect((await request.get("/social-cover.png")).headers()["content-type"]).toBe("image/png");
  expect((await request.get("/manifest.webmanifest")).ok()).toBe(true);
  expect((await request.get("/robots.txt")).ok()).toBe(true);
  expect((await request.get("/sitemap.xml")).ok()).toBe(true);
  const unauthenticated = await request.get("/api/notifications?device=" + "a".repeat(64));
  expect(unauthenticated.status()).toBe(401);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A gentle nudge", exact: true })).toBeVisible();
  await expect(page.getByText("Connect with Google above to schedule Web Push reminders.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enable notifications", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__permissionRequests"))).toBe(0);
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A home for your habits", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("detects Spanish from device language and persists an explicit language choice", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  try {
    await context.addInitScript(() => Object.defineProperty(navigator, "languages", { configurable: true, get: () => ["es-MX", "es"] }));
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { name: "Pequeños pasos. Buenos días." })).toBeVisible();
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Un espacio que se siente como tú." })).toBeVisible();
    await page.getByRole("combobox", { name: "Idioma" }).selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "A space that feels like you." })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Language" }).selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("button", { name: "Ajustes", exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("defaults appearance to system and persists Light, Dark and System selections", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark", locale: "en-US" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.locator(".sidebar").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(27, 32, 26)");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const appearance = page.getByRole("combobox", { name: "Appearance" });
    await expect(appearance).toHaveValue("system");

    await appearance.selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.locator(".sidebar").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(252, 252, 249)");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.locator(".sidebar").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(27, 32, 26)");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: "Appearance" }).selectOption("system");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.locator(".sidebar").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(252, 252, 249)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => page.locator(".sidebar").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(27, 32, 26)");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("system");
  } finally { await context.close(); }
});
