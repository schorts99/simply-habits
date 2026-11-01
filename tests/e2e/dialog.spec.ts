import { expect, test } from "@playwright/test";

test("habit dialogs fit small screens with reachable actions and scrollable fields", async ({ page }) => {
  for (const language of ["en", "es"]) {
    await page.addInitScript(value => localStorage.setItem("simply-habits.language", value), language);
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByRole("button", { name: language === "en" ? "New habit" : "Nuevo hábito", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const dimensions = await dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, overflow: element.scrollWidth > element.clientWidth };
      });
      expect(dimensions.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.top).toBeGreaterThanOrEqual(0);
      expect(dimensions.right).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.bottom).toBeLessThanOrEqual(viewport.height);
      expect(dimensions.overflow).toBe(false);
      const save = page.getByRole("button", { name: language === "en" ? "Create habit" : "Crear hábito", exact: true });
      await expect(save).toBeInViewport();
      await expect(page.getByRole("button", { name: language === "en" ? "Close habit editor" : "Cerrar editor de hábitos" })).toBeInViewport();
      await page.getByRole("textbox", { name: language === "en" ? "Habit name" : "Nombre del hábito", exact: true }).fill("Mobile dialog test");
      await page.getByRole("button", { name: language === "en" ? "blue color" : "color azul", exact: true }).click();
      await expect(save).toBeInViewport();
      expect(await page.locator(".editor-fields").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await save.click();
      await expect(dialog).not.toBeVisible();
      await page.getByRole("button", { name: language === "en" ? "Edit Mobile dialog test" : "Editar Mobile dialog test", exact: true }).first().click();
      await page.getByRole("button", { name: language === "en" ? "Archive habit" : "Archivar hábito", exact: true }).click();
      await expect(page.getByRole("button", { name: language === "en" ? "Save changes" : "Guardar cambios", exact: true })).toBeInViewport();
      await page.getByRole("button", { name: language === "en" ? "Yes, archive this habit" : "Sí, archivar este hábito", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    }
  }
});
