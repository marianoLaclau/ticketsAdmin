import { expect, test } from "@playwright/test";
import { E2E_SYSADMIN_PASSWORD } from "../support/environment";

test("mantiene el documento fijo y el desplazamiento dentro del shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 824 });
  await page.goto("/");
  await page.getByLabel("Usuario").fill("sysadmin");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(E2E_SYSADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Sistema de Tickets" }),
  ).toBeVisible();

  const metrics = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("#root");
    const shell = root?.firstElementChild;
    const main = document.querySelector<HTMLElement>("#contenido-principal");
    if (!root || !shell || !main) throw new Error("No se montó el shell");

    const shellRect = shell.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      documentOverflow: getComputedStyle(document.documentElement).overflowY,
      bodyOverflow: getComputedStyle(document.body).overflowY,
      rootOverflow: getComputedStyle(root).overflowY,
      rootHeight: root.clientHeight,
      shellHeight: shellRect.height,
      shellTop: shellRect.top,
      shellBottom: shellRect.bottom,
      mainOverflow: getComputedStyle(main).overflowY,
      mainOverscroll: getComputedStyle(main).overscrollBehaviorY,
    };
  });

  expect(metrics.documentOverflow).toBe("hidden");
  expect(metrics.bodyOverflow).toBe("hidden");
  expect(metrics.rootOverflow).toBe("hidden");
  expect(metrics.rootHeight).toBe(metrics.viewportHeight);
  expect(metrics.shellHeight).toBe(metrics.viewportHeight);
  expect(metrics.shellTop).toBe(0);
  expect(metrics.shellBottom).toBe(metrics.viewportHeight);
  expect(metrics.mainOverflow).toBe("auto");
  expect(metrics.mainOverscroll).toBe("contain");

  const activityCard = page
    .getByRole("heading", { name: "Actividad Reciente" })
    .locator("../..");
  const activityGrid = activityCard.locator("../..");
  const activityLayout = await Promise.all([
    activityCard.boundingBox(),
    activityGrid.boundingBox(),
  ]);
  const [activityCardBox, activityGridBox] = activityLayout;
  expect(activityCardBox).not.toBeNull();
  expect(activityGridBox).not.toBeNull();
  expect(
    Math.abs(activityCardBox!.height - activityGridBox!.height),
  ).toBeLessThan(1);
});

test("mantiene accesible el login cuando la pantalla es baja", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto("/");

  const login = page.locator("main");
  const initialMetrics = await login.evaluate((element) => {
    const card = element.firstElementChild;
    if (!card) throw new Error("No se montó la tarjeta de ingreso");
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      cardTop: card.getBoundingClientRect().top,
    };
  });

  expect(initialMetrics.scrollHeight).toBeGreaterThan(
    initialMetrics.clientHeight,
  );
  expect(initialMetrics.cardTop).toBeGreaterThanOrEqual(0);

  await login.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
});
