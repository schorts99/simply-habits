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

test("first-run onboarding focuses on one next step in English and Spanish", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "One small habit is enough." })).toBeVisible();
  await expect(page.getByText("Your week in bloom", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Search habits" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create my own/ })).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
  await page.getByRole("button", { name: "Mis hábitos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Con un hábito pequeño basta." })).toBeVisible();
  await expect(page.getByText("Prueba con una idea", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Beber más agua/ }).click();
  await expect(page.getByRole("heading", { name: "Beber más agua", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Con un hábito pequeño basta." })).toHaveCount(0);
});

for (const language of ["en", "es"]) {
  test(`daily workflow supports direct totals, history and individual insights in ${language}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("simply-habits.language", value), language);
    await page.goto("/");
    await page.getByRole("button", { name: language === "en" ? "My progress" : "Mi progreso", exact: true }).click();
    await expect(page.getByRole("heading", { name: language === "en" ? "Make room for your first habit." : "Haz espacio para tu primer hábito." })).toBeVisible();
    await expect(page.locator(".heatmap")).toHaveCount(0);
    await page.getByRole("button", { name: language === "en" ? "Settings" : "Ajustes", exact: true }).click();
    const models = [
      { id: crypto.randomUUID(), name: "Water", description: "", category: "Wellbeing", color: "blue", period: "Morning", target: 8, unit: "glasses", days: [0, 1, 2, 3, 4, 5, 6], created_on: "2026-01-01", updated_at: "2026-01-01T00:00:00.000Z", archived: false, entries: {} },
      { id: crypto.randomUUID(), name: "Read", description: "", category: "Learning", color: "sage", period: "Evening", target: 10, unit: "pages", days: [0, 1, 2, 3, 4, 5, 6], created_on: "2026-01-01", updated_at: "2026-01-01T00:00:00.000Z", archived: false, entries: {} },
    ];
    await expect(page.locator(".settings-navigation a")).toHaveCount(4);
    await expect(page.getByRole("button", { name: language === "en" ? "Download backup" : "Descargar copia", exact: true })).toHaveCount(1);
    await page.locator('input[type="file"]').setInputFiles({ name: "habits.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ app: "Simply Habits", version: 1, habits: models })) });
    await page.getByRole("button", { name: language === "en" ? "Restore backup" : "Restaurar copia", exact: true }).click();
    await page.getByRole("button", { name: language === "en" ? "My progress" : "Mi progreso", exact: true }).click();
    await expect(page.getByRole("heading", { name: language === "en" ? "Your story starts with a check-in." : "Tu historia empieza con un registro." })).toBeVisible();
    await page.getByRole("button", { name: language === "en" ? "Go to today" : "Ir a hoy", exact: true }).click();
    await expect(page.locator(".habit-period")).toHaveCount(2);
    await expect(page.locator(".welcome-card")).toHaveCount(0);
    const water = page.locator(".habit-card").filter({ has: page.getByRole("heading", { name: "Water", exact: true }) });
    await water.locator(".quantity-toggle").click();
    await water.getByRole("spinbutton").fill("5");
    await water.getByRole("button", { name: language === "en" ? "Save total" : "Guardar total", exact: true }).click();
    await expect(water.locator(".habit-progress")).toContainText("5 / 8");
    await page.reload();
    await expect(water.locator(".habit-progress")).toContainText("5 / 8");
    await water.locator(".quantity-toggle").click();
    await water.getByRole("spinbutton").fill("9");
    await water.getByRole("button", { name: language === "en" ? "Save total" : "Guardar total", exact: true }).click();
    expect(await water.getByRole("spinbutton").evaluate((element: HTMLInputElement) => element.validity.rangeOverflow)).toBe(true);
    await expect(water.locator(".habit-progress")).toContainText("5 / 8");
    await water.getByRole("spinbutton").fill("8");
    await water.getByRole("button", { name: language === "en" ? "Save total" : "Guardar total", exact: true }).click();
    await expect(page.locator(".recorded-habits")).not.toHaveAttribute("open");
    await expect(water).not.toBeVisible();
    await page.locator(".recorded-habits > summary").click();
    await water.locator(".check-button").click();
    await expect(water.locator(".habit-progress")).toContainText("7 / 8");
    const today = await page.locator('input[type="date"]').inputValue();
    await water.locator(".habit-week > button").nth(5).click();
    const yesterday = await page.locator('input[type="date"]').inputValue();
    expect(yesterday < today).toBe(true);
    await expect(page.locator(".history-notice")).toBeVisible();
    await water.locator(".quantity-toggle").click();
    await water.getByRole("spinbutton").fill("3");
    await water.getByRole("button", { name: language === "en" ? "Save total" : "Guardar total", exact: true }).click();
    await page.getByRole("button", { name: language === "en" ? "Back to today" : "Volver a hoy", exact: true }).click();
    await expect(water.locator(".habit-progress")).toContainText("7 / 8");
    await page.locator('input[type="date"]').fill(yesterday);
    await expect(water.locator(".habit-progress")).toContainText("3 / 8");
    await page.getByRole("button", { name: language === "en" ? "My progress" : "Mi progreso", exact: true }).click();
    await page.locator(".insight-filter select").selectOption(models[0].id);
    await page.locator(".heatmap button").nth(82).click();
    await expect(page.locator(".day-detail")).toContainText("3 / 8 glasses");
    await expect(page.locator(".day-detail")).not.toContainText("Read");
    await page.getByRole("button", { name: language === "en" ? "View this day" : "Ver este día", exact: true }).click();
    await expect(page.locator('input[type="date"]')).toHaveValue(yesterday);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`habit cards keep history and actions comfortably spaced in ${language}`, async ({ page }) => {
    await page.goto("/");
    if (language === "es") {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("es");
      await page.getByRole("button", { name: "Mis hábitos", exact: true }).click();
    }
    await page.getByRole("button", { name: /Drink more water|Beber más agua/ }).click();
    const card = page.locator(".habit-card");
    await card.locator(".check-button").click();
    await expect(card.locator(".decrement")).toBeVisible();

    for (const width of [320, 390, 594, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await card.evaluate(element => {
        const history = element.querySelector(".habit-week")!.getBoundingClientRect();
        const controls = element.querySelector(".check-controls")!.getBoundingClientRect();
        const buttons = Array.from(element.querySelectorAll(".edit-button, .check-controls button, .quantity-toggle"), button => {
          const { width, height } = button.getBoundingClientRect();
          return { width, height };
        });
        const undo = element.querySelector(".decrement")!.getBoundingClientRect();
        const checkIn = element.querySelector(".check-button")!.getBoundingClientRect();
        const progress = element.querySelector(".progress-track")!.getBoundingClientRect();
        return {
          historyGap: Math.max(controls.top - history.bottom, controls.left - history.right),
          progressGap: Math.min(history.top, controls.top) - progress.bottom,
          actionGap: checkIn.left - undo.right,
          buttons,
          fits: element.scrollWidth <= element.clientWidth && document.documentElement.scrollWidth <= innerWidth,
        };
      });
      expect(layout.historyGap, `history/action gap at ${width}px`).toBeGreaterThanOrEqual(16);
      expect(layout.progressGap, `progress/footer gap at ${width}px`).toBeGreaterThanOrEqual(24);
      expect(layout.actionGap, `action gap at ${width}px`).toBeGreaterThanOrEqual(8);
      for (const button of layout.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      expect(layout.fits, `no overflow at ${width}px`).toBe(true);
    }
  });

  test(`progress ring labels stay inside the circle in ${language}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("simply-habits.language", value), language);
    await page.goto("/");
    await page.getByRole("button", { name: /Drink more water|Beber más agua/ }).click();
    for (const percent of [0, 100]) {
      if (percent === 100) {
        await page.locator(".quantity-toggle").click();
        await page.locator(".quantity-form input").fill("8");
        await page.locator(".quantity-form button[type='submit']").click();
      }
      await expect(page.locator(".progress-ring strong")).toHaveText(`${percent}%`);
      for (const width of [320, 390, 594, 820, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.locator(".progress-ring").evaluate(element => {
          const center = element.firstElementChild!;
          const value = center.querySelector("strong")!;
          const label = center.querySelector(":scope > span")!;
          const bounds = center.getBoundingClientRect();
          const number = value.getBoundingClientRect();
          const caption = label.getBoundingClientRect();
          const text = document.createRange();
          text.selectNodeContents(label);
          const radius = bounds.width / 2;
          const cx = bounds.left + radius, cy = bounds.top + radius;
          return {
            gap: caption.top - number.bottom,
            fits: Array.from(text.getClientRects()).every(rect => [
              [rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom],
            ].every(([x, y]) => Math.hypot(x - cx, y - cy) <= radius - 4)),
            overflow: label.scrollWidth > label.clientWidth || center.scrollHeight > center.clientHeight,
          };
        });
        expect(layout.gap, `${percent}% number/label gap at ${width}px`).toBeGreaterThanOrEqual(6);
        expect(layout.fits, `${percent}% label clears the circular edge at ${width}px`).toBe(true);
        expect(layout.overflow, `${percent}% content fits at ${width}px`).toBe(false);
      }
    }
  });
}

test("habit creation keeps customization optional and saves schedule presets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create my own", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Habit name", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).not.toBeVisible();
  await page.getByRole("textbox", { name: "Habit name", exact: true }).fill("Weekday walk");
  await page.locator(".editor-options > summary").click();
  await page.getByRole("button", { name: "Weekdays", exact: true }).click();
  await page.getByRole("combobox", { name: "Time of day", exact: true }).selectOption("Afternoon");
  await page.getByRole("button", { name: "Create habit", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup", exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.habits[0]).toMatchObject({ name: "Weekday walk", days: [1, 2, 3, 4, 5], period: "Afternoon" });
});

test("create, check in, undo, edit, archive/restore, export and offline persistence", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Small steps. Good days." })).toBeVisible();
  await page.getByRole("button", { name: "Create my own", exact: true }).click();
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
  await page.locator(".recorded-habits > summary").click();
  await page.getByRole("button", { name: "Undo check-in for Launch verification habit", exact: true }).click();
  await expect(page.locator(".daily-progress > p")).toContainText("0 of 1 habits complete");
  await page.getByRole("button", { name: "Edit Launch verification habit", exact: true }).click();
  await page.getByRole("textbox", { name: "Habit name", exact: true }).fill("A verified little habit");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A verified little habit", exact: true })).toBeVisible();
  await page.locator(".habit-filters > summary").click();
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
  await page.getByRole("button", { name: "Download backup", exact: true }).click();
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
  await expect(page.getByText("Sign in under Account to set up reminders.", { exact: true })).toBeVisible();
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
