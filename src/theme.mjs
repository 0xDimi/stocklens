// Runs before styles to restore appearance without a light/dark flash.
(() => {
  const key = "stocklens:theme";
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f7f8fa" : "#091e1a";
    const toggle = document.querySelector("#theme-toggle");
    if (toggle) {
      const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
    }
  }
  let theme = "dark";
  try {
    if (localStorage.getItem(key) === "light") theme = "light";
  } catch {}
  apply(theme);
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      apply(document.documentElement.dataset.theme);
      document.querySelector("#theme-toggle").addEventListener("click", () => {
        const next =
          document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        apply(next);
        try {
          localStorage.setItem(key, next);
        } catch {}
      });
    },
    { once: true },
  );
  window.addEventListener("storage", (event) => {
    if (event.key === key && [null, "light", "dark"].includes(event.newValue))
      apply(event.newValue === "light" ? "light" : "dark");
  });
})();
