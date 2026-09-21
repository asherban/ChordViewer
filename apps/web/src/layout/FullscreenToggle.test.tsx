// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FullscreenToggle } from "./FullscreenToggle";

const originalEnabled = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenEnabled",
);
const originalElement = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenElement",
);
const originalRequest = Object.getOwnPropertyDescriptor(
  document.documentElement,
  "requestFullscreen",
);
const originalExit = Object.getOwnPropertyDescriptor(
  document,
  "exitFullscreen",
);

function browserFullscreen(enabled = true, element: Element | null = null) {
  const request = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const exit = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: enabled,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => element,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exit,
  });
  return {
    request,
    exit,
    change(next: Element | null) {
      element = next;
      document.dispatchEvent(new Event("fullscreenchange"));
    },
  };
}

function restore(
  object: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(object, property, descriptor);
  else Reflect.deleteProperty(object, property);
}

afterEach(() => {
  cleanup();
  restore(document, "fullscreenEnabled", originalEnabled);
  restore(document, "fullscreenElement", originalElement);
  restore(document.documentElement, "requestFullscreen", originalRequest);
  restore(document, "exitFullscreen", originalExit);
});

it("requests fullscreen only after a click and blocks duplicate requests while pending", async () => {
  const api = browserFullscreen();
  let finish!: () => void;
  api.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<FullscreenToggle />);
  expect(api.request).not.toHaveBeenCalled();
  expect(api.exit).not.toHaveBeenCalled();
  const enter = screen.getByRole("button", {
    name: "Enter full screen",
  }) as HTMLButtonElement;
  fireEvent.click(enter);
  fireEvent.click(enter);
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(enter.disabled).toBe(true);
  expect(enter.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("status").textContent).toContain(
    "Changing full-screen mode",
  );
  await act(async () => {
    api.change(document.documentElement);
    finish();
  });
  const exit = screen.getByRole("button", {
    name: "Exit full screen",
  }) as HTMLButtonElement;
  expect(exit.disabled).toBe(false);
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => {
    fireEvent.click(exit);
    api.change(null);
  });
  expect(api.exit).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Enter full screen" }),
  ).toBeTruthy();
});

it("tracks Escape and external fullscreen changes without making an automatic API call", () => {
  const api = browserFullscreen(true, document.documentElement);
  render(<FullscreenToggle />);
  expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
  act(() => api.change(null));
  expect(
    screen.getByRole("button", { name: "Enter full screen" }),
  ).toBeTruthy();
  act(() => api.change(document.documentElement));
  expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
  expect(api.request).not.toHaveBeenCalled();
  expect(api.exit).not.toHaveBeenCalled();
});

it("reports denied entry accessibly and permits a later successful retry", async () => {
  const api = browserFullscreen();
  api.request.mockRejectedValueOnce(new TypeError("Raw browser details"));
  render(<FullscreenToggle />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
  });
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("Could not enter full screen");
  expect(alert.textContent).not.toContain("Raw browser details");
  const button = screen.getByRole("button", {
    name: "Enter full screen",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  expect(button.getAttribute("aria-describedby")).toBe(alert.id);
  await act(async () => {
    fireEvent.click(button);
    api.change(document.documentElement);
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
});

it("offers Escape when exiting is rejected and updates after the browser exits", async () => {
  const api = browserFullscreen(true, document.documentElement);
  api.exit.mockRejectedValueOnce(new TypeError("Exit denied"));
  render(<FullscreenToggle />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
  });
  expect(screen.getByRole("alert").textContent).toContain("Press Esc to exit");
  expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
  act(() => api.change(null));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Enter full screen" }),
  ).toBeTruthy();
});

it("explains disabled fullscreen support without requesting it", () => {
  const api = browserFullscreen(false);
  render(<FullscreenToggle />);
  const button = screen.getByRole("button", {
    name: "Enter full screen",
  }) as HTMLButtonElement;
  const status = screen.getByRole("status");
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-describedby")).toBe(status.id);
  expect(status.textContent).toContain("unavailable in this browser or page");
  fireEvent.click(button);
  expect(api.request).not.toHaveBeenCalled();
});

it("handles a pending rejection after unmount without requesting exit", async () => {
  const api = browserFullscreen();
  let reject!: (reason: Error) => void;
  api.request.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const view = render(<FullscreenToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
  view.unmount();
  await act(async () => {
    reject(new Error("Pending request denied"));
  });
  expect(api.exit).not.toHaveBeenCalled();
});
